// Orchestration tests use mocks; cryptographic and SQL validation are covered separately.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: {} as any, request: {} as any, payout: {} as any, accepted: false, role: true, network: vi.fn(), broadcast: vi.fn(), verify: vi.fn(), accept: vi.fn(), walletVerify: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  let validator: any;
  const builder: any = { middleware: () => builder, inputValidator: (v: any) => { validator = v; return builder; }, handler: (fn: any) => (args: any) => fn({ data: validator ? validator.parse(args.data) : undefined, context: m.context }) };
  return builder;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('./rpc-coordination.server', () => ({rpcCoordination: () => ({})}));
vi.mock('./rpc.server', () => ({ networkHead: m.network, rpc: m.broadcast }));
vi.mock('./hub-verification', () => ({ verifyHubTransaction: m.verify }));
vi.mock('./verification', () => ({ verifyWalletSignature: m.walletVerify }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => {
    const row = table === 'testnet_hub_requests' ? m.request : table === 'testnet_payouts' ? m.payout : { id: 'challenge', address: m.payout.treasury_sender, network: 'testnet', message: 'challenge', expires_at: m.request.expires_at };
    const builder: any = { select: () => builder, eq: () => builder, single: async () => ({ data: row, error: null }) };
    return builder;
  }, rpc: m.accept,
} }));
import { completeHubResult } from './hub.functions';
const id = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const input = { id, kind: 'payout' as const, serializedTx: 'abcd', hash: 'a'.repeat(64) };
beforeEach(() => {
  vi.clearAllMocks(); m.accepted = false; m.role = true;
  vi.stubEnv('NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED', 'true'); vi.stubEnv('NIMIQ_TESTNET_RPC_URL', 'https://trusted.invalid');
  m.context = { userId: user, supabase: { rpc: async () => ({ data: m.role, error: null }) } };
  m.request = { id, kind: 'payout', user_id: user, payout_id: id, consumed_at: null, expires_at: new Date(Date.now() + 300000).toISOString() };
  m.payout = { id, network: 'testnet', status: 'uncertain', claimed_by: user, validity_start_height: 100, expires_at: m.request.expires_at, treasury_sender: 'treasury', reserve_destination: 'reserve', amount_luna: 50000, reference: 'NIMAURA:reference' };
  m.verify.mockReturnValue({ hash: input.hash, serializedTx: input.serializedTx });
  m.network.mockResolvedValue({ number: 100 }); m.broadcast.mockResolvedValue(input.hash);
  m.accept.mockImplementation(async () => {
    if (m.accepted) return { error: { message: 'consumed' } };
    m.accepted = true; m.request.consumed_at = new Date().toISOString();
    return { error: null, data: true };
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('Hub server signing/broadcast orchestration (mocked)', () => {
  it('stores before one broadcast and passes only decoded bytes to trusted configuration', async () => {
    await completeHubResult({ data: input });
    expect(m.accept.mock.invocationCallOrder[0]).toBeLessThan(m.broadcast.mock.invocationCallOrder[0] ?? 0);
    expect(m.broadcast).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://trusted.invalid' }), 'sendRawTransaction', ['abcd'], expect.anything());
    expect(m.verify).toHaveBeenCalledWith('abcd', input.hash, { sender: 'treasury', recipient: 'reserve', amountLuna: 50000, reference: 'NIMAURA:reference', validityStartHeight: 100, networkId: 5 });
  });
  it('unknown broadcast is uncertain; replay and recovery do not broadcast again', async () => {
    m.broadcast.mockRejectedValue(new Error('timeout after send'));
    expect(await completeHubResult({ data: input })).toEqual({ status: 'uncertain', payoutId: id });
    await expect(completeHubResult({ data: input })).rejects.toThrow(/already used/);
    expect(m.broadcast).toHaveBeenCalledTimes(1);
  });
  it('concurrent accepted callbacks authorize only one broadcast', async () => {
    const results = await Promise.allSettled([1,2].map(() => completeHubResult({ data: input })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(m.broadcast).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid cryptographic intent before durable acceptance or broadcast', async () => {
    m.verify.mockImplementation(() => { throw new Error('bad signature'); });
    await expect(completeHubResult({ data: input })).rejects.toThrow(/signature/);
    expect(m.accept).not.toHaveBeenCalled(); expect(m.broadcast).not.toHaveBeenCalled();
  });
  it.each(['expired', 'consumed', 'collector', 'wrong-operator', 'mainnet', 'disabled', 'rpc-failure'])('rejects %s state before broadcasting', async condition => {
    if (condition === 'expired') m.request.expires_at = new Date(0).toISOString();
    if (condition === 'consumed') m.request.consumed_at = 'used';
    if (condition === 'collector') m.role = false;
    if (condition === 'wrong-operator') m.payout.claimed_by = id;
    if (condition === 'mainnet') m.payout.network = 'mainnet';
    if (condition === 'disabled') vi.stubEnv('NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED', 'false');
    if (condition === 'rpc-failure') m.network.mockRejectedValue(new Error('no consensus'));
    await expect(completeHubResult({ data: input })).rejects.toThrow();
    expect(m.accept).not.toHaveBeenCalled(); expect(m.broadcast).not.toHaveBeenCalled();
  });
  it('rejects client endpoint/sender/amount overrides', async () => {
    expect(() => completeHubResult({ data: { ...input, endpoint: 'https://evil.invalid', sender: 'evil', amountLuna: 1 } } as any)).toThrow();
    expect(m.broadcast).not.toHaveBeenCalled();
  });
});