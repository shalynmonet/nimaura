// Import the Hub only inside browser actions: its module reads browser globals.
import { hostNetwork } from './index';

export const TESTNET_HUB_ENDPOINT = 'https://hub.nimiq-testnet.com';
export type HubIntent = { id: string; kind: 'ownership' | 'payout'; signer: string; message?: string; recipient?: string; amountLuna?: number; reference?: string; validityStartHeight?: number };
export type HubResponse = { id: string; kind: 'ownership'; signer: string; publicKey: string; signature: string } | { id: string; kind: 'payout'; serializedTx: string; hash: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export async function requireHubBrowser() {
  if (window.self !== window.top || await hostNetwork()) throw new Error('Open NIMAURA in Safari or another browser. Pay-to-web-wallet handoff is not enabled.');
}
export async function openHub(intent: HubIntent) {
  await requireHubBrowser();
  const { default: HubApi } = await import('@nimiq/hub-api');
  const behavior = new HubApi.RedirectRequestBehavior(`${window.location.origin}/hub-return`, { id: intent.id, kind: intent.kind });
  const hub = new HubApi<0>(TESTNET_HUB_ENDPOINT, behavior);
  sessionStorage.setItem('nimaura-hub-pending', intent.id);
  if (intent.kind === 'ownership' && intent.message) {
    await hub.signMessage({ appName: 'NIMAURA Testnet', signer: intent.signer, message: intent.message });
  } else if (intent.kind === 'payout' && intent.recipient && intent.amountLuna && intent.reference && intent.validityStartHeight !== undefined) {
    await hub.signTransaction({ appName: 'NIMAURA Testnet', sender: intent.signer, recipient: intent.recipient, value: intent.amountLuna, fee: 0, extraData: new TextEncoder().encode(intent.reference), validityStartHeight: intent.validityStartHeight });
  } else throw new Error('Incomplete server wallet request.');
}
export async function recoverHubResponse(onResult: (response: HubResponse) => void, onError: (error: Error) => void) {
  const { default: HubApi } = await import('@nimiq/hub-api');
  const hub = new HubApi(TESTNET_HUB_ENDPOINT);
  const save = (response: HubResponse) => {
    // Local reload recovery only; these bytes are never put in URLs or public backend rows.
    sessionStorage.setItem('nimaura-hub-result', JSON.stringify(response));
    onResult(response);
  };
  const stateId = (state: unknown, kind: string) => {
    if (!state || typeof state !== 'object' || !('id' in state) || !('kind' in state) || state.kind !== kind || typeof state.id !== 'string' || state.id !== sessionStorage.getItem('nimaura-hub-pending')) throw new Error('Unmatched Hub return.');
    return state.id;
  };
  hub.on(HubApi.RequestType.SIGN_MESSAGE, (r, state) => { try { save({ id: stateId(state, 'ownership'), kind: 'ownership', signer: r.signer, publicKey: hex(r.signerPublicKey), signature: hex(r.signature) }); } catch (e) { onError(e instanceof Error ? e : new Error('Invalid return.')); } }, onError);
  hub.on(HubApi.RequestType.SIGN_TRANSACTION, (r, state) => { try { if (Array.isArray(r)) throw new Error('Multiple transactions are not supported.'); save({ id: stateId(state, 'payout'), kind: 'payout', serializedTx: r.serializedTx, hash: r.hash }); } catch (e) { onError(e instanceof Error ? e : new Error('Invalid return.')); } }, onError);
  const saved = sessionStorage.getItem('nimaura-hub-result');
  if (saved) { try { onResult(JSON.parse(saved)); } catch { sessionStorage.removeItem('nimaura-hub-result'); } }
  await hub.checkRedirectResponse();
}