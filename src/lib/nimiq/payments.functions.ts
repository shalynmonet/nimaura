import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { newManifestationSnapshot, newSeed, INTENTIONS } from "@/lib/manifest";
import { isValidNimiqAddress, normalizeAddress, quoteAmounts, QUOTE_TTL_MS, requireUnexpired } from "./rules";
import { networkHead, verifyTransfer, rpc, transactionSchema, policySchema, type TrustedRpc, RpcPending } from "./rpc.server";
import { canReleaseUnmatched, releaseAfterHeight } from "./submission";
import { rpcCoordination } from "./rpc-coordination.server";
import { liveNimRate } from "./price.server";
import type { Quote } from "./index";
import type { Database } from "@/integrations/supabase/types";


type Net = "mainnet" | "testnet";
const P = (n: Net) => (n === "mainnet" ? "NIMIQ_MAINNET_" : "NIMIQ_TESTNET_");
const paymentsEnabled = (n: Net) => process.env[P(n) + "PAYMENTS_ENABLED"] === "true";
const rpcUrl = (n: Net) => process.env[P(n) + "RPC_URL"];
const rpcAuth = (n: Net) => process.env[P(n) + "RPC_AUTHORIZATION"];
const asNet = (n: string): Net => (n === "mainnet" ? "mainnet" : "testnet");
const NETWORK_ID: Record<Net, number> = { mainnet: 24, testnet: 5 };
type QuoteRow = Database["public"]["Tables"]["nimiq_payment_quotes"]["Row"];
function dto(q: QuoteRow): Quote {
  return { id: q.id, network: q.network === "mainnet" ? "mainnet" : "testnet", recipient: q.recipient, sender: q.sender, amountLuna: q.amount_luna, savingsLuna: q.savings_luna, rate: q.rate, expiresAt: q.expires_at, validityStartHeight: q.validity_start_height, status: q.status, txHash: q.tx_hash, manifestationId: q.manifestation_id, submissionOutcome: q.submission_outcome, candidateTxHash: q.candidate_tx_hash, submissionStartedAt: q.submission_started_at, submissionDetail: q.submission_detail };
}
const networkInput = z.object({ network: z.enum(["mainnet", "testnet"]) });
export const getPaymentState = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(networkInput).handler(async ({ data, context }) => {
  const { data: quotes, error } = await context.supabase.from("nimiq_payment_quotes").select("*").eq("user_id", context.userId).eq("network", data.network).in("status", ["quoted", "pending", "verified", "fulfilled"]).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error("Payment history unavailable.");
  return quotes?.[0] ? dto(quotes[0]) : null;
});
export const createPaymentQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ network: z.enum(["mainnet", "testnet"]), address: z.string().transform(normalizeAddress).refine(isValidNimiqAddress), dropId: z.string().uuid(), intention: z.enum(INTENTIONS) })).handler(async ({ data, context }) => {
  // Payments stay disabled until the creator explicitly configures a receiving wallet,
  // trusted history RPC, and enables the testnet pipeline. Mainnet requires its own NIMIQ_MAINNET_* configuration.
  const enabled = paymentsEnabled(data.network);
  const url = rpcUrl(data.network);
  const recipientValue = process.env[P(data.network) + "RECIPIENT"];
  if (!enabled || !url || !recipientValue || !isValidNimiqAddress(recipientValue)) throw new Error(data.network === "mainnet" ? "Mainnet payments are not enabled yet." : "Testnet payments are not enabled. A receiving wallet and trusted testnet verification are required.");
  const { data: link } = await context.supabase.from("nimiq_wallet_links").select("id").eq("user_id", context.userId).eq("network", data.network).eq("address", data.address).maybeSingle();
  if (!link) throw new Error("Verify your paying wallet in Account first.");
  const { data: reserve } = await context.supabase.from("nimiq_wallet_links").select("address").eq("user_id", context.userId).eq("network", data.network).eq("is_reserve", true).maybeSingle();
  if (!reserve) throw new Error("Verify your Reserve wallet on the same network first.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: old } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("user_id", context.userId).eq("network", data.network).in("status", ["quoted", "pending"]).limit(1).maybeSingle();
  if (old) {
    if (old.status === "quoted" && Date.parse(old.expires_at) <= Date.now()) {
      const result = await supabaseAdmin.from("nimiq_payment_quotes").update({ status: "failed" }).eq("id", old.id).eq("status", "quoted");
      if (result.error) throw new Error("Could not expire the old quote.");
    } else return dto(old);
  }
  const { data: drop } = await supabaseAdmin.from("daily_drops").select("*").eq("id", data.dropId).single();
  const now = Date.now();
  if (!drop || now < Date.parse(drop.starts_at) || now >= Date.parse(drop.ends_at)) throw new Error("This drop is closed.");
  const service: TrustedRpc = { url, authorization: rpcAuth(data.network), coordination: rpcCoordination(supabaseAdmin) };
  const head = await networkHead(service, data.network, true);
  const rate = await liveNimRate();
  const amounts = quoteAmounts(rate);
  const seed = newSeed();
  const result = await supabaseAdmin.from("nimiq_payment_quotes").insert({ user_id: context.userId, drop_id: drop.id, intention: data.intention, seed, config: newManifestationSnapshot(seed, data.intention), network: data.network, reserve_address_snapshot: reserve.address, sender: data.address, recipient: normalizeAddress(recipientValue), amount_luna: amounts.amountLuna, savings_luna: amounts.savingsLuna, rate, expires_at: new Date(Math.min(Date.now() + QUOTE_TTL_MS, Date.parse(drop.ends_at))).toISOString(), validity_start_height: head.number }).select("*").single();
  if (result.error || !result.data) throw new Error("Could not prepare a payment quote. Check existing payment status before retrying.");
  return dto(result.data);
});
export const preparePayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: q } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (q && !paymentsEnabled(asNet(q.network))) throw new Error("Payments on this network are disabled.");
  if (!q || q.status !== "quoted") throw new Error("This payment was already started. Check its status instead of paying again.");
  requireUnexpired(q.expires_at);
  const result = await supabaseAdmin.from("nimiq_payment_quotes").update({ status: "pending", submission_outcome: "awaiting_wallet", submission_started_at: new Date().toISOString() }).eq("id", q.id).eq("status", "quoted").select("*").single();
  if (result.error || !result.data) throw new Error("Payment already started. Check its status.");
  return dto(result.data);
});
export const recordSubmission = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), outcome: z.enum(['awaiting_wallet','cancelled','rejected','unknown','hash_received']), txHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(), detail: z.string().max(240).optional() })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.rpc('record_collector_submission', { _id: data.id, _user_id: context.userId, _outcome: data.outcome, ...(data.txHash ? { _hash: data.txHash.toLowerCase() } : {}), ...(data.detail ? { _detail: data.detail } : {}) });
  if (result.error) throw new Error('Could not save wallet outcome. Keep this purchase locked and check again.');
  return true;
});
export const checkPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), txHash: z.string().regex(/^[a-f0-9]{64}$/i).optional() })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: q } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (!q) throw new Error("Payment not found.");
  const net = asNet(q.network);
  if (!paymentsEnabled(net)) throw new Error("Payments on this network are disabled.");
  if (q.status === "fulfilled") return dto(q);
  if (q.status !== "pending") return dto(q);
  let hash = q.tx_hash ?? q.candidate_tx_hash ?? data.txHash?.toLowerCase();
  if (q.tx_hash && data.txHash && q.tx_hash !== data.txHash.toLowerCase()) throw new Error("A different transaction is assigned. Reconciliation required.");
  const url = rpcUrl(net);
  if (!url) throw new Error("Trusted verification is not configured.");
  const service: TrustedRpc = { url, authorization: rpcAuth(net), coordination: rpcCoordination(supabaseAdmin) };
  try {
    if (!hash) {
      // History is candidate discovery only; identity/HTLC proof, timing and finality
      // still pass through the exact existing verifier below. Absence never releases a purchase.
      await networkHead(service, net);
      const rows = await rpc(service, 'getTransactionsByAddress', [q.recipient, 100, null], z.array(transactionSchema));
      const candidates = rows.filter(tx => tx.to === q.recipient && tx.value === q.amount_luna && tx.networkId === NETWORK_ID[net] && tx.executionResult && tx.timestamp !== undefined && tx.timestamp >= Date.parse(q.created_at) && tx.timestamp <= Date.parse(q.expires_at));
      if (rows.length === 100 || candidates.length > 1) return { ...dto(q), retryAfterMs: 60_000, submissionDetail: 'History is incomplete or matching candidates are ambiguous. This purchase remains unresolved.' };
      if (!candidates[0]) {
        const release = net === "mainnet" ? { canRelease: false, lateMatch: false, headHeight: q.validity_start_height, releaseAfterHeight: null } : await releaseStatus(service, q, rows);
        return { ...dto(q), retryAfterMs: release.canRelease ? 300_000 : 60_000, ...release, submissionDetail: release.canRelease ? 'The payment window has closed and no matching transfer reached the receiving wallet. You can release this purchase.' : release.lateMatch ? 'A transfer matching this amount arrived outside the quote window. Reconciliation required; do not pay again.' : 'No candidate in the latest receiving history yet. This does not prove no broadcast or no charge.' };
      }
      hash = candidates[0].hash;
      const saved = await supabaseAdmin.rpc('record_collector_submission', { _id: q.id, _user_id: context.userId, _outcome: 'hash_received', _hash: hash });
      if (saved.error) throw new Error('Could not save discovered candidate. Reconciliation required.');
    }
    const expected = { txHash: hash, sender: q.sender, recipient: q.recipient, amountLuna: q.amount_luna, network: net, validityStartHeight: q.validity_start_height, createdAt: q.created_at, expiresAt: q.expires_at };
    if (!await verifyTransfer(service, expected, undefined, true)) return { ...dto(q), status: "pending", retryAfterMs: 10_000 };
  } catch (error) {
    if (error instanceof RpcPending) return { ...dto(q), status: "pending", retryAfterMs: error.retryAfterMs };
    throw error;
  }
  // Pin only after trusted finalized verification; bad user input cannot poison a quote.
  if (!q.tx_hash) {
    const saved = await supabaseAdmin.from("nimiq_payment_quotes").update({ tx_hash: hash }).eq("id", q.id).eq("user_id", context.userId).eq("status", "pending").is("tx_hash", null).select("id").single();
    if (saved.error || !saved.data) {
      const { data: winner } = await supabaseAdmin.from('nimiq_payment_quotes').select('*').eq('id',q.id).eq('user_id',context.userId).single();
      if (!winner || winner.tx_hash !== hash) throw new Error("Verification raced different evidence. Reconciliation required.");
      if (winner.status === 'fulfilled') return dto(winner);
    }
  }
  const result = await supabaseAdmin.rpc(net === "mainnet" ? "fulfill_mainnet_payment" : "fulfill_testnet_payment", { _id: q.id, _user_id: context.userId, _hash: hash });
  if (result.error) throw new Error("Finalized test payment awaits reconciliation. Do not pay again.");
  return { ...dto(q), txHash: hash, status: "fulfilled", manifestationId: result.data };
});
type HistoryRow = z.infer<typeof transactionSchema>;
async function releaseStatus(service: TrustedRpc, q: QuoteRow, rows: HistoryRow[]) {
  const head = await networkHead(service, asNet(q.network));
  const policy = await rpc(service, 'getPolicyConstants', [], policySchema);
  // Any transfer of this exact amount after quote creation blocks release, even outside the window.
  const late = rows.filter(tx => tx.to === q.recipient && tx.value === q.amount_luna && (tx.timestamp === undefined || tx.timestamp >= Date.parse(q.created_at)));
  const window = policy.transactionValidityWindow;
  const canRelease = canReleaseUnmatched({ headHeight: head.number, quoteHeight: q.validity_start_height, validityWindow: window, expiresAt: q.expires_at, now: Date.now(), historyComplete: rows.length < 100, matchingTransfers: late.length, hasEvidence: !!(q.tx_hash ?? q.candidate_tx_hash) });
  return { canRelease, lateMatch: late.length > 0, headHeight: head.number, releaseAfterHeight: window ? releaseAfterHeight(q.validity_start_height, window) : null };
}
/** Collector-initiated release of a purchase proven unpayable; re-proves every condition server-side. */
export const releaseUnmatchedPurchase = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: q } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (!q || q.network !== "testnet") throw new Error("Payment not found.");
  if (q.status !== "pending" || q.tx_hash || q.candidate_tx_hash) throw new Error("This purchase has payment evidence or is not unresolved. It cannot be released.");
  const url = rpcUrl("testnet");
  if (!url) throw new Error("Trusted verification is not configured.");
  const service: TrustedRpc = { url, authorization: rpcAuth("testnet"), coordination: rpcCoordination(supabaseAdmin) };
  try {
    await networkHead(service, 'testnet');
    const rows = await rpc(service, 'getTransactionsByAddress', [q.recipient, 100, null], z.array(transactionSchema));
    const release = net === "mainnet" ? { canRelease: false, lateMatch: false, headHeight: null, releaseAfterHeight: null } : await releaseStatus(service, q, rows);
    if (!release.canRelease) throw new Error(release.lateMatch ? "A matching transfer exists. Reconciliation required; do not pay again." : "The wallet could still deliver this payment. Release is not safe yet.");
  } catch (error) {
    if (error instanceof RpcPending) throw new Error(`Verification service is busy. Try again in ${Math.ceil(error.retryAfterMs / 1000)}s.`);
    throw error;
  }
  const result = await supabaseAdmin.rpc("release_unmatched_collector_purchase", { _id: q.id, _user_id: context.userId });
  if (result.error) throw new Error("Could not release this purchase. It remains locked.");
  return true;
});
