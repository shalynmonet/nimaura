import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHALLENGE_TTL_MS, isValidNimiqAddress, normalizeAddress, requireUnexpired } from "./rules";
import { verifyWalletSignature } from "./verification";

const walletInput = z.object({ address: z.string().transform(normalizeAddress).refine(isValidNimiqAddress), network: z.enum(["mainnet", "testnet"]), purpose: z.enum(["connect", "reserve"]) });
export const createWalletChallenge = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(walletInput).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const recent = await supabaseAdmin.from("nimiq_wallet_challenges").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", new Date(Date.now() - CHALLENGE_TTL_MS).toISOString());
  if (recent.error) throw new Error("Wallet verification unavailable.");
  if ((recent.count ?? 0) >= 10) throw new Error("Too many wallet requests. Try again in five minutes.");
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const message = `NIMAURA wallet ownership\nCollector: ${context.userId}\nAddress: ${data.address}\nNetwork: ${data.network}\nPurpose: ${data.purpose}\nChallenge: ${id}\nExpires: ${expiresAt}\nThis verifies ownership only. It does not authorize payments.`;
  const { error } = await supabaseAdmin.from("nimiq_wallet_challenges").insert({ id, user_id: context.userId, ...data, message, expires_at: expiresAt });
  if (error) throw new Error("Could not start wallet verification.");
  return { id, message, expiresAt };
});
export const verifyWalletChallenge = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), publicKey: z.string().regex(/^[a-f0-9]{64}$/i), signature: z.string().regex(/^[a-f0-9]{128}$/i) })).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: challenge, error } = await supabaseAdmin.from("nimiq_wallet_challenges").select("*").eq("id", data.id).eq("user_id", context.userId).single();
  if (error || !challenge || challenge.consumed_at) throw new Error("Wallet challenge unavailable or already used.");
  requireUnexpired(challenge.expires_at);
  if (!verifyWalletSignature(challenge.message, challenge.address, data.publicKey, data.signature)) throw new Error("The signing wallet does not own this address. Nimiq Pay chooses the signer; select that wallet's address.");
  const result = await supabaseAdmin.rpc("consume_nimiq_wallet_challenge", { _id: challenge.id, _user_id: context.userId, _public_key: data.publicKey.toLowerCase() });
  if (result.error) throw new Error("Could not link wallet. The challenge may have expired or the wallet belongs to another collector.");
  return { address: challenge.address, network: challenge.network, purpose: challenge.purpose };
});