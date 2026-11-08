import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTransfer, findPayoutHashes, referenceHex, transactionSchema, RpcPending, rpc, networkHead, type RpcCoordination } from "./rpc.server";
import { z } from "zod";
const sender = "NQ0700000000000000000000000000000000";
const hash = "a".repeat(64);
const expected = { txHash: hash, sender, recipient: sender, amountLuna: 100_000, network: "testnet" as const, validityStartHeight: 100, createdAt: "2026-11-08T00:00:00Z", expiresAt: "2026-11-08T00:05:00Z" };
const service = { maxRequests: 100, requestCount: 0, nextAt: 0, url: "https://trusted.invalid/rpc" };
let tx: Record<string, unknown>, consensus: boolean, network: number, inclusion: boolean, macroHeight: number, unstable: boolean, conflicting: boolean, badParent: boolean;
let netIdMode: "ok" | "unsupported" | "down", txMode: "ok" | "notfound" | "error", rateLimited: number;
const blockHash = (height: number) => height.toString(16).padStart(64, "0");
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  service.requestCount = 0; service.nextAt = 0;
  tx = { hash, from: sender, to: sender, value: 100_000, fee: 0, networkId: 5, validityStartHeight: 100, blockNumber: 101, timestamp: Date.parse("2026-11-08T00:01:00Z"), executionResult: true, recipientData: referenceHex("NIMAURA:test") };
  consensus = true; network = 5; inclusion = true; macroHeight = 120; unstable = false; conflicting = false; badParent = false;
  netIdMode = "ok"; txMode = "ok"; rateLimited = 0;
  let macroReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    if (rateLimited > 0) { rateLimited--; return new Response("slow down", { status: 429 }); }
    service.nextAt = 0;
    const { method, params } = JSON.parse(options.body);
    if (method === "getNetworkId" && netIdMode === "unsupported") return new Response(JSON.stringify({ jsonrpc: "2.0", error: "Method not allowed", id: 1 }), { status: 400 });
    if (method === "getNetworkId" && netIdMode === "down") return new Response("down", { status: 500 });
    if (method === "getTransactionByHash" && txMode === "notfound") return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error", data: `Transaction not found: ${hash}` }, id: 1 }));
    if (method === "getTransactionByHash" && txMode === "error") return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32602, message: "Invalid params" }, id: 1 }));
    let data: unknown;
    if (method === "getNetworkId") data = network;
    else if (method === "isConsensusEstablished") data = consensus;
    else if (method === "getPolicyConstants") data = {blocksPerBatch: 60, genesisBlockNumber: 0};
    else if (method === "getMacroBlockBefore") data = macroHeight;
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
afterEach(() => vi.useRealTimers());
describe("trusted Albatross adversarial verification", () => {
  it("requires canonical macro finality and exact reference", async () => { expect(await verifyTransfer(service, expected, "NIMAURA:test")).toBe(true); });
  it("does not confuse micro head with finality", async () => { tx["blockNumber"] = 121; expect(await verifyTransfer(service, expected)).toBe(false); });
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
  it("returns a retry delay without immediately retrying a rate-limited request", async () => { rateLimited = 2; await expect(verifyTransfer(service, expected, "NIMAURA:test")).rejects.toBeInstanceOf(RpcPending); expect(fetch).toHaveBeenCalledTimes(1); });
  it("fails closed under persistent rate limiting", async () => { rateLimited = 99; await expect(verifyTransfer(service, expected)).rejects.toBeInstanceOf(RpcPending); });
});
describe('paced bounded and resumable RPC', () => {
  it('never reads proof-stripped transaction caches written by the old release', async () => {
    const legacyKey = `nimiq:testnet:getTransactionByHash:${JSON.stringify([hash])}`;
    const read = vi.fn(async (key: string) => key === legacyKey ? { ...tx, value: 1 } : null);
    const coordination: RpcCoordination = { read, claim: async () => 'token', reserve: async () => Date.now(), write: async () => {}, defer: async () => {} };
    expect((await rpc({url:service.url,coordination}, 'getTransactionByHash', [hash], transactionSchema)).value).toBe(100000);
    expect(read).toHaveBeenCalledWith(`nimiq:testnet:proof-v1:getTransactionByHash:${JSON.stringify([hash])}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  function coordinator() {
    const cache = new Map<string, unknown>(); const claimed = new Set<string>();
    const reserve = vi.fn(async () => Date.now());
    const defer = vi.fn(async () => {});
    const coordination: RpcCoordination = {
      read: async key => cache.get(key), claim: async key => { if (claimed.has(key)) return null; claimed.add(key); return key; },
      reserve, defer, write: async (key, _token, value) => { cache.set(key, value); claimed.delete(key); },
    };
    return {coordination, reserve, defer};
  }
  it('resumes cached ancestry across bounded invocations and only succeeds after all links', async () => {
    const {coordination} = coordinator(); let done = false; let retries = 0;
    while (!done && retries++ < 10) {
      try { done = await verifyTransfer({url:service.url,coordination,maxRequests:8},expected); }
      catch (error) { expect(error).toBeInstanceOf(RpcPending); }
    }
    expect(done).toBe(true); expect(retries).toBeGreaterThan(1);
    const calls = vi.mocked(fetch).mock.calls.map(([,o]) => JSON.parse(String(o?.body)));
    expect(calls.filter(c => c.method === 'getBlockByNumber' && c.params[0] === 110)).toHaveLength(1);
  });
  it('coalesces an in-flight cache miss instead of creating a second outbound request', async () => {
    const {coordination} = coordinator(); const first = rpc({url:service.url,coordination},'getBlockNumber',[],z.number());
    const second = rpc({url:service.url,coordination},'getBlockNumber',[],z.number());
    expect(await first).toBe(125); await expect(second).rejects.toBeInstanceOf(RpcPending); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('caches only the exact unsupported network method while retaining explicit block network checks',async()=>{
    const {coordination}=coordinator(); netIdMode='unsupported';
    for(let i=0;i<2;i++) await expect(rpc({url:service.url,coordination},'getNetworkId',[],z.number())).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('honors Retry-After and durably defers the shared IP gate', async () => {
    const {coordination,defer} = coordinator();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429,headers:{'Retry-After':'23'}})));
    await expect(rpc({url:service.url,coordination},'getBlockNumber',[],z.number())).rejects.toMatchObject({retryAfterMs:23000});
    expect(defer).toHaveBeenCalledWith('nimiq:testnet:shared-outbound',expect.any(Number)); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('spaces direct adapter requests at least 750ms apart', async () => {
    const s = {url:service.url}; const stamps:number[]=[];
    vi.stubGlobal('fetch',vi.fn(async()=>{stamps.push(Date.now());return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{data:125}}));}));
    await rpc(s,'getBlockNumber',[],z.number()); const second=rpc(s,'getBlockNumber',[],z.number());
    await vi.advanceTimersByTimeAsync(750); await second;
    expect((stamps[1] ?? 0)-(stamps[0] ?? 0)).toBeGreaterThanOrEqual(750);
  });
  it('never retries sendRawTransaction on an ambiguous HTTP failure',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
    await expect(rpc({url:service.url},'sendRawTransaction',['opaque'],z.string())).rejects.toBeInstanceOf(RpcPending);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('recovers the hosted getNetworkId failure using workerd-compatible manual redirects', async () => {
    const {coordination}=coordinator(); const upstream=vi.mocked(fetch).getMockImplementation();
    if (!upstream) throw new Error('Missing upstream fixture');
    netIdMode='unsupported';
    vi.stubGlobal('fetch',vi.fn(async (url,options) => {
      // Exact workerd failure, previously hidden by rpc() as a 10s delay.
      if (options?.redirect === 'error') throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
      expect(options?.redirect).toBe('manual');
      return upstream(url,options);
    }));
    expect((await networkHead({url:service.url,coordination},'testnet',true)).number).toBe(125);
    expect((await networkHead({url:service.url,coordination},'testnet',true)).network).toBe(5);
    const calls=vi.mocked(fetch).mock.calls.map(([,o])=>JSON.parse(String(o?.body)).method);
    expect(calls.filter(m=>m==='getNetworkId')).toHaveLength(1);
    expect(calls.filter(m=>m==='isConsensusEstablished')).toHaveLength(2);
    expect(calls.filter(m=>m==='getBlockNumber')).toHaveLength(2);
    expect(calls.filter(m=>m==='getBlockByNumber')).toHaveLength(2);
  });
  it('rejects redirects without following or forwarding credentials', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:302,headers:{Location:'https://other.invalid/'}})));
    await expect(rpc({url:service.url,authorization:'test-only'},'getBlockNumber',[],z.number())).rejects.toThrow('invalid');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
  it('does not accept cached consensus or head when preparing a fresh quote', async () => {
    const {coordination}=coordinator();
    await networkHead({url:service.url,coordination},'testnet');
    consensus=false;
    await expect(networkHead({url:service.url,coordination},'testnet',true)).rejects.toThrow('consensus');
  });
});
