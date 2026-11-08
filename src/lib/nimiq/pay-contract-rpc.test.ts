import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/pay-htlc-testnet.json';
import { verifyTransfer } from './rpc.server';
const tx = fixture.transaction;
const q = { txHash: tx.hash, sender: fixture.contract.sender.replace(/\s/g, ''), recipient: tx.to.replace(/\s/g, ''), amountLuna: 381315540, network: 'testnet' as const, validityStartHeight: 16189200, createdAt: '2026-11-08T02:42:09.869358Z', expiresAt: '2026-11-08T02:47:09.615Z' };
const blockHash = (n: number) => n.toString(16).padStart(64, '0');
function upstream(change: Record<string, unknown> = {}, canonicalChange: Record<string, unknown> = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const { method, params } = JSON.parse(options.body);
    let data: unknown;
    if (method === 'getNetworkId') data = 5;
    if (method === 'isConsensusEstablished') data = true;
    if (method === 'getBlockNumber') data = 16189360;
    if (method === 'getAccountByAddress') data = fixture.contract;
    if (method === 'getTransactionByHash') data = { ...tx, ...change };
    if (method === 'getPolicyConstants') data = { blocksPerBatch: 60, genesisBlockNumber: 3032010, transactionValidityWindow: 7200 };
    if (method === 'getMacroBlockBefore') data = 16189350;
    if (method === 'getBlockByNumber') data = { number: params[0], timestamp: tx.timestamp, parentHash: blockHash(params[0] - 1), hash: blockHash(params[0]), network: 'TestAlbatross', type: params[0] === 16189350 ? 'macro' : 'micro', ...(params[1] ? { transactions: [{ ...tx, ...change, ...canonicalChange }] } : {}) };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data } }));
  }));
  // Isolate evidence tests from wall-clock pacing (covered by rpc.test).
  return { url: 'https://trusted.invalid', maxRequests: 100, coordination: { read: async () => null, claim: async () => 'test', reserve: async () => Date.now(), write: async () => {}, defer: async () => {} } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('collector-only Pay integration regression', () => {
  it('reproduces strict production sender/117-block-height rejection', async () => {
    await expect(verifyTransfer(upstream(), q)).rejects.toThrow('match');
  });
  it('accepts actual signed contract evidence only after canonical macro ancestry', async () => {
    expect(await verifyTransfer(upstream(), q, undefined, true)).toBe(true);
  });
  it('does not relax treasury payout verification', async () => {
    await expect(verifyTransfer(upstream(), q, 'NIMAURA:payout', true)).rejects.toThrow('match');
  });
  it('rejects canonical proof substitution', async () => {
    await expect(verifyTransfer(upstream({}, { proof: '00' }), q, undefined, true)).rejects.toThrow('Canonical Pay');
  });
  it('rejects a quote snapshot ahead of signed/inclusion height', async () => {
    await expect(verifyTransfer(upstream(), { ...q, validityStartHeight: tx.blockNumber + 1 }, undefined, true)).rejects.toThrow('bounds');
  });
  it('rejects an over-age quote snapshot even with matching time and signatures', async () => {
    await expect(verifyTransfer(upstream(), { ...q, validityStartHeight: tx.blockNumber - 7200 }, undefined, true)).rejects.toThrow('bounds');
  });
  it('preserves the exact quote time window', async () => {
    await expect(verifyTransfer(upstream(), { ...q, expiresAt: '2026-11-08T02:44:00Z' }, undefined, true)).rejects.toThrow('window');
  });
  it('still rejects unsuccessful contract execution', async () => {
    await expect(verifyTransfer(upstream({ executionResult: false }), q, undefined, true)).rejects.toThrow('failed');
  });
});