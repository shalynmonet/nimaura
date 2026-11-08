import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ network: vi.fn(), message: vi.fn(), transaction: vi.fn(), check: vi.fn(), handlers: new Map<string, (r: unknown, s: unknown) => void>(), endpoints: [] as string[] }));
vi.mock('./index', () => ({ hostNetwork: mocks.network }));
vi.mock('@nimiq/hub-api', () => {
  class Hub {
    static RedirectRequestBehavior = class { constructor(public url: string, public state: unknown) {} };
    static RequestType = { SIGN_MESSAGE: 'message', SIGN_TRANSACTION: 'transaction' };
    constructor(endpoint: string) { mocks.endpoints.push(endpoint); }
    signMessage = mocks.message;
    signTransaction = mocks.transaction;
    checkRedirectResponse = mocks.check;
    on(command: string, fn: (r: unknown, s: unknown) => void) { mocks.handlers.set(command, fn); }
  }
  return { default: Hub };
});
import { openHub, recoverHubResponse } from './hub';
beforeEach(() => { vi.clearAllMocks(); mocks.handlers.clear(); mocks.endpoints.length = 0; sessionStorage.clear(); mocks.network.mockResolvedValue(undefined); });
describe('Hub browser-only redirect contract (mocked, not device validation)', () => {
  it('uses only fixed testnet endpoint and explicit signer message', async () => {
    await openHub({ id: 'request', kind: 'ownership', signer: 'reserve', message: 'challenge' });
    expect(mocks.endpoints).toEqual(['https://hub.nimiq-testnet.com']);
    expect(mocks.message).toHaveBeenCalledWith({ appName: 'NIMAURA Testnet', signer: 'reserve', message: 'challenge' });
  });
  it('refuses native Pay handoff before requesting Hub signatures', async () => {
    mocks.network.mockResolvedValue('testnet');
    await expect(openHub({ id: 'request', kind: 'ownership', signer: 'reserve', message: 'challenge' })).rejects.toThrow(/browser/);
    expect(mocks.message).not.toHaveBeenCalled();
  });
  it('rejects mismatched return state and multiple signed transactions', async () => {
    sessionStorage.setItem('nimaura-hub-pending', 'request');
    const result = vi.fn(), error = vi.fn(); await recoverHubResponse(result, error);
    mocks.handlers.get('message')?.({ signer: 'wallet', signerPublicKey: new Uint8Array(32), signature: new Uint8Array(64) }, { id: 'forged', kind: 'ownership' });
    mocks.handlers.get('transaction')?.([], { id: 'request', kind: 'payout' });
    expect(result).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledTimes(2);
  });
  it('recovers returned result after reload without signing or broadcasting again', async () => {
    const response = { id: 'request', kind: 'payout', serializedTx: 'abcd', hash: 'a'.repeat(64) };
    sessionStorage.setItem('nimaura-hub-result', JSON.stringify(response));
    const result = vi.fn(); await recoverHubResponse(result, vi.fn());
    expect(result).toHaveBeenCalledWith(response); expect(mocks.transaction).not.toHaveBeenCalled();
  });
});