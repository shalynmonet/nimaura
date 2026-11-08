import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { CHALLENGE_TTL_MS, QUOTE_TTL_MS, LUNA_PER_NIM, isValidNimiqAddress, quoteAmounts, requireUnexpired } from "./rules";
import { bytesToHex, publicKeyAddress, signedMessageHash, validatePaymentEvidence, verifyWalletSignature } from "./verification";

describe("Nimiq wallet proof", () => {
  const privateKey = new Uint8Array(32).fill(7); // Fixed, valueless test key only.
  const publicKey = bytesToHex(ed25519.getPublicKey(privateKey));
  const address = publicKeyAddress(publicKey);
  const message = "NIMAURA ownership challenge: unique-1";
  const signature = bytesToHex(ed25519.sign(signedMessageHash(message), privateKey));
  it("requires a valid signature for the claimed public-key address", () => {
    expect(verifyWalletSignature(message, address, publicKey, signature)).toBe(true);
    expect(verifyWalletSignature(message, "NQ0700000000000000000000000000000000", publicKey, signature)).toBe(false);
  });
  it("rejects a signature reused for a different challenge", () => {
    expect(verifyWalletSignature(message + "different", address, publicKey, signature)).toBe(false);
  });
  it("requires a valid Nimiq address checksum", () => {
    expect(isValidNimiqAddress("NQ07 0000 0000 0000 0000 0000 0000 0000 0000")).toBe(true);
    expect(isValidNimiqAddress("NQ00 0000 0000 0000 0000 0000 0000 0000 0000")).toBe(false);
    expect(isValidNimiqAddress(address)).toBe(true);
  });
  it("expires challenges after five minutes", () => { expect(CHALLENGE_TTL_MS).toBe(300_000); expect(() => requireUnexpired("2026-11-08T00:05:00Z", Date.parse("2026-11-08T00:05:00Z"))).toThrow(); });
});
describe("Nimiq payment rules", () => {
  const expected = { txHash: "a".repeat(64), sender: "NQ0700000000000000000000000000000000", recipient: "NQ0700000000000000000000000000000000", amountLuna: 100_000, network: "mainnet" as const, validityStartHeight: 100, createdAt: "2026-11-08T00:00:00Z", expiresAt: "2026-11-08T00:05:00Z" };
  const transaction = { hash: expected.txHash, from: expected.sender, to: expected.recipient, value: 100_000, networkId: 24, validityStartHeight: 100, blockNumber: 101, timestamp: Date.parse("2026-11-08T00:01:00Z"), executionResult: true };
  it("uses 100000 Luna per NIM", () => { expect(LUNA_PER_NIM).toBe(100_000); expect(quoteAmounts(1).amountLuna).toBe(100_000); });
  it("allocates exactly 50 percent to Reserve", () => { const q = quoteAmounts(0.003); expect(q.savingsLuna * 2).toBe(q.amountLuna); });
  it("expires payment quotes after five minutes", () => { expect(QUOTE_TTL_MS).toBe(300_000); });
  it("does not mistake an included transaction for finality", () => { expect(validatePaymentEvidence(transaction, expected, 100)).toBe(false); expect(validatePaymentEvidence(transaction, expected, 101)).toBe(true); });
  it("isolates testnet payments from mainnet", () => { expect(() => validatePaymentEvidence({ ...transaction, networkId: 5 }, expected, 101)).toThrow(); });
  it("requires the exact recipient", () => { expect(() => validatePaymentEvidence({ ...transaction, to: "NQ00" }, expected, 101)).toThrow(); });
  it("requires the exact Luna amount", () => { expect(() => validatePaymentEvidence({ ...transaction, value: 99_999 }, expected, 101)).toThrow(); });
  it("requires successful execution", () => { expect(() => validatePaymentEvidence({ ...transaction, executionResult: false }, expected, 101)).toThrow(); });
  it("rejects transactions from outside the quote window", () => { expect(() => validatePaymentEvidence({ ...transaction, timestamp: Date.parse("2026-11-07T23:59:00Z") }, expected, 101)).toThrow(); });
  it("binds verification to the submitted transaction hash", () => { expect(() => validatePaymentEvidence({ ...transaction, hash: "b".repeat(64) }, expected, 101)).toThrow(); });
  it("binds verification to the verified paying wallet", () => { expect(() => validatePaymentEvidence({ ...transaction, from: "NQ00" }, expected, 101)).toThrow(); });
});