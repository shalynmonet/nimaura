import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTransfer, findPayoutHashes, referenceHex, transactionSchema } from "./rpc.server";
const sender = "NQ0700000000000000000000000000000000";
const hash = "a".repeat(64);
const expected = { txHash: hash, sender, recipient: sender, amountLuna: 100_000, network: "testnet" as const, validityStartHeight: 100, createdAt: "2026-11-08T00:00:00Z", expiresAt: "2026-11-08T00:05:00Z" };
const service = { url: "https://trusted.invalid/rpc" };
let tx: Record<string, unknown>, consensus: boolean, network: number, inclusion: boolean, macroHeight: number, unstable: boolean, conflicting: boolean, badParent: boolean;
let netIdMode: "ok" | "unsupported" | "down", txMode: "ok" | "notfound" | "error", rateLimited: number;
const blockHash = (height: number) => height.toString(16).padStart(64, "0");
beforeEach(() => {
  tx = { hash, from: sender, to: sender, value: 100_000, fee: 0, networkId: 5, validityStartHeight: 100, blockNumber: 101, timestamp: Date.parse("2026-11-08T00:01:00Z"), executionResult: true, recipientData: referenceHex("NIMAURA:test") };
  consensus = true; network = 5; inclusion = true; macroHeight = 120; unstable = false; conflicting = false; badParent = false;
  netIdMode = "ok"; txMode = "ok"; rateLimited = 0;
  let macroReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    if (rateLimited > 0) { rateLimited--; return new Response("slow down", { status: 429 }); }
    const { method, params } = JSON.parse(options.body);
    if (method === "getNetworkId" && netIdMode === "unsupported") return new Response(JSON.stringify({ jsonrpc: "2.0", error: "Method not allowed", id: 1 }), { status: 400 });
    if (method === "getNetworkId" && netIdMode === "down") return new Response("down", { status: 500 });
    if (method === "getTransactionByHash" && txMode === "notfound") return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error", data: `Transaction not found: ${hash}` }, id: 1 }));
    if (method === "getTransactionByHash" && txMode === "error") return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32602, message: "Invalid params" }, id: 1 }));
    let data: unknown;
    if (method === "getNetworkId") data = network;
    else if (method === "isConsensusEstablished") data = consensus;
    else if (method === "getBlockNumber") data = 125;
    else if (method === "getTransactionByHash") data = tx;
    else if (method === "getTransactionsByAddress") data = [tx];
    else if (method === "getBlockByNumber") {
      const height = params[0];
      if (height === macroHeight) macroReads++;
      data = { number: height, timestamp: Date.parse("2026-11-08T00:01:00Z"), parentHash: badParent ? "f".repeat(64) : blockHash(height-1), network, type: height === macroHeight ? "macro" : "micro", hash: unstable && macroReads > 1 ? "d".repeat(64) : blockHash(height), ...(params[1] ? { transactions: inclusion ? [{ ...tx, ...(conflicting ? { blockNumber: 102 } : {}) }] : [] } : {}) };
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { data } }));
  }));
});
describe("trusted Albatross adversarial verification", () => {
  it("requires canonical macro finality and exact reference", async () => { expect(await verifyTransfer(service, expected, "NIMAURA:test")).toBe(true); });
  it("does not confuse micro head with finality", async () => { macroHeight = 60; expect(await verifyTransfer(service, expected)).toBe(false); });
  it("rejects lack of consensus", async () => { consensus = false; await expect(verifyTransfer(service, expected)).rejects.toThrow("consensus"); });
  it("rejects a mainnet endpoint", async () => { network = 24; await expect(verifyTransfer(service, expected)).rejects.toThrow("testnet"); });
  it("rejects failed execution", async () => { tx["executionResult"] = false; await expect(verifyTransfer(service, expected)).rejects.toThrow("failed"); });
  it("rejects a transaction absent from canonical block", async () => { inclusion = false; await expect(verifyTransfer(service, expected)).rejects.toThrow("absent"); });
  it("rejects changed macro evidence", async () => { unstable = true; await expect(verifyTransfer(service, expected)).rejects.toThrow("Finality changed"); });
  it.each(["value", "networkId", "validityStartHeight", "timestamp"])("rejects changed %s", async (field) => { tx[field] = 1; await expect(verifyTransfer(service, expected)).rejects.toThrow(); });
  it("rejects different treasury sender", async () => { await expect(verifyTransfer(service, { ...expected, sender: "NQ00" })).rejects.toThrow("match"); });
  it("rejects a changed Reserve destination", async () => { await expect(verifyTransfer(service, { ...expected, recipient: "NQ00" })).rejects.toThrow("match"); });
  it("rejects different public memo", async () => { await expect(verifyTransfer(service, expected, "different")).rejects.toThrow("reference"); });
  it("rejects fractional or unsafe Luna", () => { expect(transactionSchema.safeParse({ ...tx, value: 0.5 }).success).toBe(false); expect(transactionSchema.safeParse({ ...tx, value: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false); });
  it("reconciles an unknown broadcast by reference", async () => { expect(await findPayoutHashes(service, sender, "NIMAURA:test")).toEqual([hash]); });
  it("never interprets empty history as permission to resend", async () => { tx["recipientData"] = ""; expect(await findPayoutHashes(service, sender, "NIMAURA:test")).toEqual([]); });
  it("rejects inconsistent canonical transaction height", async () => { conflicting = true; await expect(verifyTransfer(service, expected)).rejects.toThrow("metadata"); });
  it("rejects broken inclusion-to-macro ancestry", async () => { badParent = true; await expect(verifyTransfer(service, expected)).rejects.toThrow("ancestry"); });
  it("rejects HTTP before fetching", async () => { await expect(verifyTransfer({ url: "http://untrusted.invalid" }, expected)).rejects.toThrow("HTTPS"); expect(fetch).not.toHaveBeenCalled(); });
  it("rejects malformed RPC envelopes", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result: tx })))); await expect(verifyTransfer(service, expected)).rejects.toThrow("invalid"); });
});
describe("documented public-node compatibility (rpc.testnet.nimiqwatch.com)", () => {
  it("verifies strictly by canonical block network when getNetworkId is unsupported", async () => { netIdMode = "unsupported"; expect(await verifyTransfer(service, expected, "NIMAURA:test")).toBe(true); });
  it("still rejects a mainnet endpoint when getNetworkId is unsupported", async () => { netIdMode = "unsupported"; network = 24; await expect(verifyTransfer(service, expected)).rejects.toThrow("testnet"); });
  it("never silently accepts a failing getNetworkId", async () => { netIdMode = "down"; await expect(verifyTransfer(service, expected)).rejects.toThrow(); });
  it("treats only the precise unknown-hash error as pending", async () => { txMode = "notfound"; expect(await verifyTransfer(service, expected)).toBe(false); });
  it("fails closed on other transaction lookup errors", async () => { txMode = "error"; await expect(verifyTransfer(service, expected)).rejects.toThrow("invalid"); });
  it("retries through rate limiting and then verifies", async () => { rateLimited = 2; expect(await verifyTransfer(service, expected, "NIMAURA:test")).toBe(true); });
  it("fails closed under persistent rate limiting", async () => { rateLimited = 99; await expect(verifyTransfer(service, expected)).rejects.toThrow("invalid"); });
});
