import type { NimiqProvider } from "@nimiq/mini-app-sdk";
import { isValidNimiqAddress, normalizeAddress, requireUnexpired, type Network } from "./rules";
export { isValidNimiqAddress } from "./rules";
export type { Network } from "./rules";

export type Quote = {
  id: string; network: Network; recipient: string; sender: string; amountLuna: number;
  savingsLuna: number; rate: number; expiresAt: string; validityStartHeight: number;
  status: string; txHash: string | null; manifestationId: string | null;
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
  requireUnexpired(quote.expiresAt);
  if (await hostNetwork() !== quote.network) throw new Error("Wallet network changed. Request a new quote.");
  if (!isValidNimiqAddress(quote.recipient) || !Number.isSafeInteger(quote.amountLuna) || quote.amountLuna <= 0) throw new Error("Invalid payment quote.");
  const p = await provider();
  if (!await p.isConsensusEstablished()) throw new Error("Nimiq Pay is reconnecting to the network. Try again shortly.");
  return p.sendBasicTransaction({ recipient: quote.recipient, value: quote.amountLuna, validityStartHeight: quote.validityStartHeight });
}
export async function walletError(error: unknown) {
  const { NimiqProviderError } = await import("@nimiq/mini-app-sdk");
  if (NimiqProviderError.is(error)) {
    if (error.type === "PERMISSION_DENIED") return "Wallet request canceled. Nothing was changed.";
    if (error.type === "NETWORK_ERROR") return "Wallet network error. Check payment status before trying again.";
    return "Nimiq Pay could not complete the request. Please try again.";
  }
  return error instanceof Error ? error.message : "Wallet request could not be completed.";
}