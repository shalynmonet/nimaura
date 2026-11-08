import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findPayoutHashes, networkHead, verifyTransfer, type TrustedRpc } from "./rpc.server";

const input = z.object({ id: z.string().uuid() });
export const payoutAccess = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return !role.error && role.data === true;
});
export const listPayouts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  const result = await context.supabase.from("testnet_payouts").select("*").order("created_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Queue unavailable.");
  return result.data;
});
export const claimPayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  if (process.env["NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED"] !== "true") throw new Error("Manual testnet payouts are disabled.");
  const payout = await context.supabase.from("testnet_payouts").select("treasury_sender").eq("id",data.id).single();
  if (payout.error || !payout.data) throw new Error("Payout unavailable.");
  const link = await context.supabase.from("nimiq_wallet_links").select("id").eq("user_id",context.userId).eq("network","testnet").eq("address",payout.data.treasury_sender).maybeSingle();
  if (link.error || !link.data) throw new Error("Verify the treasury signer first. Separate web Wallet approval requires Hub support.");
  const url = process.env["NIMIQ_TESTNET_RPC_URL"];
  if (!url) throw new Error("Trusted testnet RPC required.");
  const service: TrustedRpc = { url, authorization: process.env["NIMIQ_TESTNET_RPC_AUTHORIZATION"] };
  const head = await networkHead(service, "testnet");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.rpc("claim_testnet_payout", { _id: data.id, _operator: context.userId, _height: head.number, _expires: new Date(Date.now() + 300_000).toISOString() });
  if (result.error) throw new Error("Already claimed or unavailable. Reconcile; never resend.");
  return result.data;
});
export const reconcilePayout = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input.extend({ txHash: z.string().regex(/^[a-f0-9]{64}$/i).optional() })).handler(async ({ data, context }) => {
  const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (role.error || role.data !== true) throw new Error("Admin required.");
  if (process.env["NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED"] !== "true") throw new Error("Manual testnet payouts are disabled.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.from("testnet_payouts").select("*").eq("id", data.id).single();
  const p = result.data;
  if (result.error || !p || p.network !== "testnet") throw new Error("Payout unavailable.");
  if (p.status === "paid") return { status: "paid" };
  if (p.status !== "uncertain" || !p.claim_token || !p.claimed_by || !p.claimed_at || p.validity_start_height === null || !p.expires_at) throw new Error("Claim required.");
  const url = process.env["NIMIQ_TESTNET_RPC_URL"];
  if (!url) throw new Error("Trusted testnet RPC required.");
  const service: TrustedRpc = { url, authorization: process.env["NIMIQ_TESTNET_RPC_AUTHORIZATION"] };
  if (p.tx_hash && data.txHash && p.tx_hash !== data.txHash.toLowerCase()) throw new Error('Stored payout hash cannot be replaced.');
  const hashes = p.tx_hash ? [p.tx_hash] : data.txHash ? [data.txHash.toLowerCase()] : await findPayoutHashes(service, p.treasury_sender, p.reference);
  if (data.txHash && !hashes.includes(data.txHash.toLowerCase())) hashes.push(data.txHash.toLowerCase());
  if (hashes.length > 1) throw new Error("Multiple transfers may match. Manual investigation required; never resend.");
  const hash = hashes[0];
  if (!hash) return { status: "uncertain" };
  const verified = await verifyTransfer(service, { txHash: hash, sender: p.treasury_sender, recipient: p.reserve_destination, amountLuna: p.amount_luna, network: "testnet", validityStartHeight: p.validity_start_height, createdAt: p.claimed_at, expiresAt: p.expires_at }, p.reference);
  if (!verified) return { status: "uncertain" };
  // Allow another admin to reconcile, while SQL binds completion to the original durable claim.
  const completed = await supabaseAdmin.rpc("complete_testnet_payout", { _id: p.id, _operator: p.claimed_by, _token: p.claim_token, _hash: hash });
  if (completed.error) throw new Error("Payout reconciliation changed. Reload; never resend.");
  return { status: "paid" };
});