import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findPayoutHashes, networkHead, verifyTransfer, type TrustedRpc, RpcPending } from "./rpc.server";

import { rpcCoordination } from "./rpc-coordination.server";
import { ledger, netEnv, payoutsEnabled, type Net } from "./net";

const netField = z.enum(["mainnet", "testnet"]).default("testnet");
const input = z.object({ id: z.string().uuid(), network: netField });
const rpcFor = (n: Net, coordination: NonNullable<TrustedRpc["coordination"]>): TrustedRpc => { const url = netEnv(n, "RPC_URL"); if (!url) throw new Error(`Trusted ${n} RPC required.`); return { url, coordination, authorization: netEnv(n, "RPC_AUTHORIZATION") }; };
export const payoutAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return !role.error && role.data === true;
});
export const listPayouts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ network: netField }).default({ network: "testnet" })).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  const result = await context.supabase.from(ledger(data.network).payouts).select("*").order("created_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Queue unavailable.");
  return result.data;
});
export const claimPayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  if (!payoutsEnabled(data.network)) throw new Error(`Manual ${data.network} payouts are disabled.`);
  const payout = await context.supabase.from(ledger(data.network).payouts).select("treasury_sender").eq("id",data.id).single();
  if (payout.error || !payout.data) throw new Error("Payout unavailable.");
  const link = await context.supabase.from("nimiq_wallet_links").select("id").eq("user_id",context.userId).eq("network",data.network).eq("address",payout.data.treasury_sender).maybeSingle();
  if (link.error || !link.data) throw new Error("Verify the treasury signer first. Separate web Wallet approval requires Hub support.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const service = rpcFor(data.network, rpcCoordination(supabaseAdmin));
  const head = await networkHead(service, data.network);
  const result = await supabaseAdmin.rpc(ledger(data.network).claim, { _id: data.id, _operator: context.userId, _height: head.number, _expires: new Date(Date.now() + 300_000).toISOString() });
  if (result.error) throw new Error("Already claimed or unavailable. Reconcile; never resend.");
  return result.data;
});
export const reconcilePayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ txHash: z.string().regex(/^[a-f0-9]{64}$/i).optional() })).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  if (!payoutsEnabled(data.network)) throw new Error(`Manual ${data.network} payouts are disabled.`);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.from(ledger(data.network).payouts).select("*").eq("id", data.id).single();
  const p = result.data;
  if (result.error || !p || p.network !== data.network) throw new Error("Payout unavailable.");
  if (p.status === "paid") return { status: "paid" };
  if (p.status !== "uncertain" || !p.claim_token || !p.claimed_by || !p.claimed_at || p.validity_start_height === null || !p.expires_at) throw new Error("Claim required.");
  const service = rpcFor(data.network, rpcCoordination(supabaseAdmin));
  if (p.tx_hash && data.txHash && p.tx_hash !== data.txHash.toLowerCase()) throw new Error('Stored payout hash cannot be replaced.');
  let hashes: string[];
  try { hashes = p.tx_hash ? [p.tx_hash] : data.txHash ? [data.txHash.toLowerCase()] : await findPayoutHashes(service, p.treasury_sender, p.reference); }
  catch (error) { if (error instanceof RpcPending) return { status: 'uncertain', retryAfterMs: error.retryAfterMs }; throw error; }
  if (data.txHash && !hashes.includes(data.txHash.toLowerCase())) hashes.push(data.txHash.toLowerCase());
  if (hashes.length > 1) throw new Error("Multiple transfers may match. Manual investigation required; never resend.");
  const hash = hashes[0];
  if (!hash) return { status: "uncertain" };
  let verified: boolean;
  try { verified = await verifyTransfer(service, { txHash: hash, sender: p.treasury_sender, recipient: p.reserve_destination, amountLuna: p.amount_luna, network: data.network, validityStartHeight: p.validity_start_height, createdAt: p.claimed_at, expiresAt: p.expires_at }, p.reference);
  } catch (error) { if (error instanceof RpcPending) return { status: "uncertain", retryAfterMs: error.retryAfterMs }; throw error; }
  if (!verified) return { status: "uncertain" };
  // Allow another admin to reconcile, while SQL binds completion to the original durable claim.
  const completed = await supabaseAdmin.rpc(ledger(data.network).complete, { _id: p.id, _operator: p.claimed_by, _token: p.claim_token, _hash: hash });
  if (completed.error) throw new Error("Payout reconciliation changed. Reload; never resend.");
  return { status: "paid" };
});
// Reopens only an expired claim with no signed bytes, no used wallet result and no on-chain transfer for its reference.
export const reopenPayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  if (!payoutsEnabled(data.network)) throw new Error(`Manual ${data.network} payouts are disabled.`);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const p = (await supabaseAdmin.from(ledger(data.network).payouts).select("*").eq("id", data.id).single()).data;
  if (!p || p.network !== data.network || p.status !== "uncertain" || p.tx_hash || !p.expires_at || Date.parse(p.expires_at) > Date.now()) throw new Error("Only an expired, unsigned claim can be reopened.");
  const service = rpcFor(data.network, rpcCoordination(supabaseAdmin));
  let hashes: string[];
  try { hashes = await findPayoutHashes(service, p.treasury_sender, p.reference); }
  catch (error) { if (error instanceof RpcPending) return { status: "uncertain" as const, retryAfterMs: error.retryAfterMs }; throw error; }
  if (hashes.length) throw new Error("A transfer with this reference exists. Reconcile instead; never reopen.");
  const reopened = await supabaseAdmin.rpc(ledger(data.network).reopen, { _id: p.id, _operator: context.userId });
  if (reopened.error) throw new Error("This claim cannot be reopened safely. Reconcile; never resend.");
  return { status: "queued" as const };
});
