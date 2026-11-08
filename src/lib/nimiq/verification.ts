import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { addressFromBytes, normalizeAddress, type Network } from "./rules";

// Protocol sources: nimiq/keyguard src/lib/Key.js signMessage;
// nimiq/core-js PublicKey.hash/toAddress and Address.fromHash.
export function signedMessageHash(message: string) {
  const bytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x16Nimiq Signed Message:\n${bytes.length}`);
  const payload = new Uint8Array(prefix.length + bytes.length);
  payload.set(prefix); payload.set(bytes, prefix.length);
  return sha256(payload);
}
export function publicKeyAddress(publicKey: string) {
  if (!/^[a-f0-9]{64}$/i.test(publicKey)) throw new Error("Invalid wallet public key");
  return addressFromBytes(blake2b(hexToBytes(publicKey), { dkLen: 32 }).slice(0, 20));
}
export function verifyWalletSignature(message: string, address: string, publicKey: string, signature: string) {
  if (!/^[a-f0-9]{128}$/i.test(signature)) return false;
  try {
    return publicKeyAddress(publicKey) === normalizeAddress(address) && ed25519.verify(hexToBytes(signature), signedMessageHash(message), hexToBytes(publicKey), { zip215: false });
  } catch { return false; }
}
export { bytesToHex };

export type TransactionEvidence = {
  hash: string; from: string; to: string; value: number; networkId: number;
  validityStartHeight: number; blockNumber?: number | undefined; timestamp?: number | undefined; executionResult: boolean;
};
export type ExpectedPayment = {
  txHash: string; sender: string; recipient: string; amountLuna: number;
  network: Network; validityStartHeight: number; createdAt: string; expiresAt: string;
};
export function validatePaymentEvidence(tx: TransactionEvidence, q: ExpectedPayment, finalizedHeight: number) {
  if (tx.hash.toLowerCase() !== q.txHash.toLowerCase() || tx.networkId !== (q.network === "mainnet" ? 24 : 5) || normalizeAddress(tx.to) !== q.recipient || normalizeAddress(tx.from) !== q.sender || tx.value !== q.amountLuna || tx.validityStartHeight !== q.validityStartHeight) throw new Error("Transaction does not match this payment quote.");
  if (!tx.executionResult) throw new Error("Transaction execution failed.");
  if (tx.blockNumber === undefined || tx.timestamp === undefined) return false;
  if (tx.timestamp < Date.parse(q.createdAt) || tx.timestamp > Date.parse(q.expiresAt)) throw new Error("Payment was not included within the quote window.");
  return tx.blockNumber <= finalizedHeight;
}