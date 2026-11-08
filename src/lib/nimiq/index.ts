/**
 * Nimiq integration boundary. Each concern is a separate module so the real
 * Nimiq Mini App SDK can be wired in without touching UI code.
 *
 * STATUS: The official SDK is NOT yet wired. We deliberately do not call any
 * SDK function we have not verified against https://nimiq.dev/mini-apps.
 * Every function below either works for real (quote via public price API) or
 * returns an explicit "not_configured" result.
 */

export type NotConfigured = { ok: false; reason: "not_configured"; detail: string };
const NOT_WIRED = (what: string): NotConfigured => ({
  ok: false,
  reason: "not_configured",
  detail: `${what} requires the official Nimiq Mini App SDK running inside Nimiq Pay. Not wired yet.`,
});

// 1. Wallet connection
export function isInsideNimiqPay(): boolean {
  // Placeholder detection: the verified host-detection API from the SDK goes here.
  return false;
}
export async function connectWallet(): Promise<NotConfigured | { ok: true; address: string }> {
  return NOT_WIRED("Wallet connection");
}

// 2. Payment quoting — real: uses a public NIM/USD price feed.
export type Quote = {
  usd: number;
  rate: number; // USD per NIM
  nim: number;
  savingsNim: number;
  creatorNim: number;
  networkFeeNote: string;
  fetchedAt: string;
};
export async function quoteUnseal(usd = 1): Promise<Quote> {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd");
  if (!res.ok) throw new Error("Price feed unavailable");
  const json = (await res.json()) as { "nimiq-2"?: { usd?: number } };
  const rate = json["nimiq-2"]?.usd;
  if (!rate || rate <= 0) throw new Error("Price feed returned no NIM rate");
  const nim = Math.round((usd / rate) * 1e5) / 1e5;
  return {
    usd,
    rate,
    nim,
    savingsNim: Math.round((nim / 2) * 1e5) / 1e5,
    creatorNim: Math.round((nim / 2) * 1e5) / 1e5,
    networkFeeNote: "Network fee is shown by Nimiq Pay before you approve.",
    fetchedAt: new Date().toISOString(),
  };
}

// 3. Payment initiation
export async function initiatePayment(_q: Quote): Promise<NotConfigured> {
  return NOT_WIRED("Payment initiation");
}
// 4. Independent payment verification (must run server-side against the Nimiq network)
export async function verifyPayment(_txHash: string): Promise<NotConfigured> {
  return NOT_WIRED("Payment verification");
}
// 5. Reserve address registration — validates format only; ownership proof needs SDK signing.
export function isValidNimiqAddress(addr: string) {
  return /^NQ\d{2}( ?[0-9A-Z]{4}){8}$/i.test(addr.trim());
}
// 6/7. Savings transfer initiation + verification (server-side, needs a treasury signer)
export async function initiateSavingsTransfer(): Promise<NotConfigured> {
  return NOT_WIRED("Savings transfer");
}
export async function verifySavingsTransfer(): Promise<NotConfigured> {
  return NOT_WIRED("Savings transfer verification");
}
// 8. Collectible issuance happens in the database (unseal_with_credit / future paid fn).
