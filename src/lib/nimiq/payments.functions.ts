import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildManifestation, newSeed, INTENTIONS } from "@/lib/manifest";
import { isValidNimiqAddress, normalizeAddress, quoteAmounts, QUOTE_TTL_MS, requireUnexpired } from "./rules";
import { validatePaymentEvidence } from "./verification";
import { assertRpcNetwork, blockSchema, finalizedHeight, networkHead, rpc } from "./rpc.server";
import type { Quote } from "./index";
import type { Database } from "@/integrations/supabase/types";

type QuoteRow = Database["public"]["Tables"]["nimiq_payment_quotes"]["Row"];
function dto(q: QuoteRow): Quote {
  return { id: q.id, network: q.network === "mainnet" ? "mainnet" : "testnet", recipient: q.recipient, sender: q.sender, amountLuna: q.amount_luna, savingsLuna: q.savings_luna, rate: q.rate, expiresAt: q.expires_at, validityStartHeight: q.validity_start_height, status: q.status, txHash: q.tx_hash, manifestationId: q.manifestation_id };
}
const networkInput = z.object({ network: z.enum(["mainnet", "testnet"]) });
export const getPaymentState = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(networkInput).handler(async ({ data, context }) => {
  const { data: quotes, error } = await context.supabase.from("nimiq_payment_quotes").select("*").eq("user_id", context.userId).eq("network", data.network).in("status", ["quoted", "pending", "verified"]).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error("Payment history unavailable.");
  return quotes?.[0] ? dto(quotes[0]) : null;
});
export const createPaymentQuote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ network: z.enum(["mainnet", "testnet"]), address: z.string().transform(normalizeAddress).refine(isValidNimiqAddress), dropId: z.string().uuid(), intention: z.enum(INTENTIONS) })).handler(async ({ data, context }) => {
  // Payments stay disabled until the creator explicitly configures a receiving wallet,
  // trusted history RPC, and enables the payment pipeline. Payouts are always disabled.
  const enabled = process.env["NIMIQ_PAYMENTS_ENABLED"] === "true";
  const url = process.env[data.network === "mainnet" ? "NIMIQ_MAINNET_RPC_URL" : "NIMIQ_TESTNET_RPC_URL"];
  const recipientValue = process.env[data.network === "mainnet" ? "NIMIQ_MAINNET_RECIPIENT" : "NIMIQ_TESTNET_RECIPIENT"];
  if (!enabled || !url || !recipientValue || !isValidNimiqAddress(recipientValue)) throw new Error("Real payments are not enabled yet. NIMAURA needs a receiving wallet and a trusted Nimiq verification service.");
  const { data: link } = await context.supabase.from("nimiq_wallet_links").select("id").eq("user_id", context.userId).eq("network", data.network).eq("address", data.address).maybeSingle();
  if (!link) throw new Error("Verify your paying wallet in Account first.");
  const { data: reserve } = await context.supabase.from("nimiq_wallet_links").select("id").eq("user_id", context.userId).eq("network", data.network).eq("is_reserve", true).maybeSingle();
  if (!reserve) throw new Error("Verify your Reserve wallet on the same network first.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: old } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("user_id", context.userId).eq("network", data.network).in("status", ["quoted", "pending", "verified"]).limit(1).maybeSingle();
  if (old) {
    if (old.status === "quoted" && Date.parse(old.expires_at) <= Date.now()) {
      const result = await supabaseAdmin.from("nimiq_payment_quotes").update({ status: "failed" }).eq("id", old.id).eq("status", "quoted");
      if (result.error) throw new Error("Could not expire the old quote.");
    } else return dto(old);
  }
  const { data: drop } = await supabaseAdmin.from("daily_drops").select("*").eq("id", data.dropId).single();
  const now = Date.now();
  if (!drop || now < Date.parse(drop.starts_at) || now >= Date.parse(drop.ends_at)) throw new Error("This drop is closed.");
  const head = await networkHead(url, data.network);
  let rate: number;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error("Unavailable");
    rate = z.object({ "nimiq-2": z.object({ usd: z.number().positive() }) }).parse(await res.json())["nimiq-2"].usd;
  } catch { throw new Error("Live NIM pricing is unavailable. No payment was requested."); }
  const amounts = quoteAmounts(rate);
  const seed = newSeed();
  const result = await supabaseAdmin.from("nimiq_payment_quotes").insert({ user_id: context.userId, drop_id: drop.id, intention: data.intention, seed, config: buildManifestation(seed, data.intention), network: data.network, sender: data.address, recipient: normalizeAddress(recipientValue), amount_luna: amounts.amountLuna, savings_luna: amounts.savingsLuna, rate, expires_at: new Date(Math.min(Date.now() + QUOTE_TTL_MS, Date.parse(drop.ends_at))).toISOString(), validity_start_height: head.number }).select("*").single();
  if (result.error || !result.data) throw new Error("Could not prepare a payment quote. Check existing payment status before retrying.");
  return dto(result.data);
});
export const preparePayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  if (process.env["NIMIQ_PAYMENTS_ENABLED"] !== "true") throw new Error("Payments are disabled.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: q } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (!q || q.status !== "quoted") throw new Error("This payment was already started. Check its status instead of paying again.");
  requireUnexpired(q.expires_at);
  const result = await supabaseAdmin.from("nimiq_payment_quotes").update({ status: "pending" }).eq("id", q.id).eq("status", "quoted").select("*").single();
  if (result.error || !result.data) throw new Error("Payment already started. Check its status.");
  return dto(result.data);
});
export const checkPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), txHash: z.string().regex(/^[a-f0-9]{64}$/i).optional() })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: q } = await supabaseAdmin.from("nimiq_payment_quotes").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (!q) throw new Error("Payment not found.");
  if (q.status === "fulfilled") return dto(q);
  if (q.status === "verified" && q.network === "mainnet") {
    const result = await supabaseAdmin.rpc("fulfill_verified_nimiq_payment", { _id: q.id, _user_id: context.userId });
    if (result.error) throw new Error("Payment verified; fulfillment pending. Check again shortly.");
    return { ...dto(q), status: "fulfilled", manifestationId: result.data };
  }
  if (q.status !== "pending") return dto(q);
  const hash = q.tx_hash ?? data.txHash?.toLowerCase();
  if (!hash) return dto(q);
  if (q.tx_hash && data.txHash && q.tx_hash !== data.txHash.toLowerCase()) throw new Error("A different transaction is already assigned to this payment.");
  if (!q.tx_hash) {
    const saved = await supabaseAdmin.from("nimiq_payment_quotes").update({ tx_hash: hash }).eq("id", q.id).is("tx_hash", null).select("id").single();
    if (saved.error || !saved.data) throw new Error("Transaction already assigned or could not be saved. Reload payment status.");
  }
  const network = q.network === "mainnet" ? "mainnet" : "testnet";
  const url = process.env[network === "mainnet" ? "NIMIQ_MAINNET_RPC_URL" : "NIMIQ_TESTNET_RPC_URL"];
  if (!url) throw new Error("Nimiq verification is not configured. Payment remains pending.");
  const head = await networkHead(url, network);
  const schema = z.object({ hash: z.string(), from: z.string(), to: z.string(), value: z.number().int(), networkId: z.number().int(), validityStartHeight: z.number().int(), blockNumber: z.number().int().optional(), timestamp: z.number().optional(), executionResult: z.boolean() }).nullable();
  const tx = await rpc(url, "getTransactionByHash", [hash], schema);
  if (!tx) return { ...dto(q), txHash: hash };
  const final = await finalizedHeight(url, network, head.number);
  const matches = validatePaymentEvidence(tx, { txHash: hash, sender: q.sender, recipient: q.recipient, amountLuna: q.amount_luna, network, validityStartHeight: q.validity_start_height, createdAt: q.created_at, expiresAt: q.expires_at }, final);
  if (!matches) return { ...dto(q), txHash: hash };
  const canonical = await rpc(url, "getBlockByNumber", [tx.blockNumber, true], blockSchema.extend({ transactions: z.array(schema.unwrap()) }));
  assertRpcNetwork(network, canonical.network);
  if (!canonical.transactions.some((item) => item.hash.toLowerCase() === hash && validatePaymentEvidence(item, { txHash: hash, sender: q.sender, recipient: q.recipient, amountLuna: q.amount_luna, network, validityStartHeight: q.validity_start_height, createdAt: q.created_at, expiresAt: q.expires_at }, final))) throw new Error("Payment not found in finalized canonical block.");
  const saved = await supabaseAdmin.from("nimiq_payment_quotes").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", q.id).eq("tx_hash", hash).eq("status", "pending").select("id").single();
  if (saved.error || !saved.data) throw new Error("Verification changed during this check. Reload payment status.");
  if (network === "testnet") return { ...dto(q), txHash: hash, status: "verified" };
  const fulfillment = await supabaseAdmin.rpc("fulfill_verified_nimiq_payment", { _id: q.id, _user_id: context.userId });
  if (fulfillment.error) throw new Error("Payment verified; fulfillment pending. Check again shortly.");
  return { ...dto(q), txHash: hash, status: "fulfilled", manifestationId: fulfillment.data };
});