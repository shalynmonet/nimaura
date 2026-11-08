import type { NimiqProvider } from "@nimiq/mini-app-sdk";
import { isValidNimiqAddress, normalizeAddress, requireUnexpired, type Network } from "./rules";
export { isValidNimiqAddress } from "./rules";
export type { Network } from "./rules";

export type Quote = {
  id: string; network: Network; recipient: string; sender: string; amountLuna: number;
  savingsLuna: number; rate: number; expiresAt: string; validityStartHeight: number;
  status: string; txHash: string | null; manifestationId: string | null; retryAfterMs?: number;
  submissionOutcome?: string; candidateTxHash?: string | null; submissionStartedAt?: string | null; submissionDetail?: string | null;
  canRelease?: boolean; headHeight?: number; releaseAfterHeight?: number | null;
};
let providerPromise: Promise<NimiqProvider> | undefined;
export async function hostNetwork(): Promise<Network | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getHostNetwork } = await import("@nimiq/mini-app-sdk");
  return getHostNetwork();
}
async function provider() {
  if (typeof window === "undefined") throw new Error("Open NIMAURA inside Nimiq Pay.");
  if (!providerPromise) {
    providerPromise = import("@nimiq/mini-app-sdk").then(({ init }) => init({ timeout: 5000 })).catch(() => {
      providerPromise = undefined;
      throw new Error("Nimiq Pay wallet unavailable. Open NIMAURA inside an updated Nimiq Pay app.");
    });
  }
  return providerPromise;
}
export async function connectWallet() {
  const p = await provider();
  const network = await hostNetwork();
  if (!network) throw new Error("Nimiq Pay did not report its network. Update the app before connecting.");
  const accounts = (await p.listAccounts()).map(normalizeAddress).filter(isValidNimiqAddress);
  if (!accounts.length) throw new Error("No valid Nimiq wallet was shared.");
  return { accounts, network };
}
export async function signWalletChallenge(message: string) {
  return (await provider()).sign(message);
}
export async function initiatePayment(quote: Quote) {
  if (quote.network !== "testnet") throw new Error("Mainnet payments remain disabled.");
  requireUnexpired(quote.expiresAt);
  if (await hostNetwork() !== quote.network) throw new Error("Wallet network changed. Request a new quote.");
  if (!isValidNimiqAddress(quote.recipient) || !Number.isSafeInteger(quote.amountLuna) || quote.amountLuna <= 0) throw new Error("Invalid payment quote.");
  const p = await provider();
  if (!await p.isConsensusEstablished()) throw new Error("Nimiq Pay is reconnecting to the network. Try again shortly.");
  return p.sendBasicTransaction({ recipient: quote.recipient, value: quote.amountLuna, validityStartHeight: quote.validityStartHeight });
}
export async function initiatePayout(payout: { network: string; status: string; reference: string; reserve_destination: string; amount_luna: number; validity_start_height: number | null; expires_at: string | null }) {
  if (payout.network !== "testnet" || payout.status !== "uncertain" || await hostNetwork() !== "testnet") throw new Error("Claimed testnet payout required.");
  if (!payout.expires_at || payout.validity_start_height === null) throw new Error("Payout claim missing.");
  requireUnexpired(payout.expires_at);
  if (!isValidNimiqAddress(payout.reserve_destination) || !Number.isSafeInteger(payout.amount_luna) || payout.amount_luna <= 0 || new TextEncoder().encode(payout.reference).length > 64) throw new Error("Invalid payout.");
  const p = await provider();
  if (!await p.isConsensusEstablished()) throw new Error("Wallet has no consensus. Reconcile claim; do not resend.");
  return p.sendBasicTransactionWithData({ recipient: payout.reserve_destination, value: payout.amount_luna, data: payout.reference, validityStartHeight: payout.validity_start_height });
}
export async function walletError(error: unknown) {
  const { NimiqProviderError } = await import("@nimiq/mini-app-sdk");
  if (NimiqProviderError.is(error)) {
    if (error.type === "PERMISSION_DENIED") return "Wallet request canceled. Nothing was changed.";
    if (error.type === "NETWORK_ERROR") return "Wallet network error. Check payment status before trying again.";
    return "Nimiq Pay could not complete the request. Check this purchase; do not request another payment.";
  }
  return error instanceof Error ? error.message : "Wallet request could not be completed.";
}