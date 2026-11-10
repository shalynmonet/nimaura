// Network-scoped names for the isolated testnet and mainnet payout ledgers.
// Both ledgers share one audited schema shape; names never mix across networks.
export type Net = 'mainnet' | 'testnet';
export const NETWORK_IDS: Record<Net, number> = { mainnet: 24, testnet: 5 };
export const HUB_ENDPOINTS: Record<Net, string> = { mainnet: 'https://hub.nimiq.com', testnet: 'https://hub.nimiq-testnet.com' };
export function ledger(n: Net) {
  const m = n === 'mainnet';
  return {
    payouts: (m ? 'mainnet_payouts' : 'testnet_payouts') as 'testnet_payouts',
    requests: (m ? 'mainnet_hub_requests' : 'testnet_hub_requests') as 'testnet_hub_requests',
    claim: (m ? 'claim_mainnet_payout' : 'claim_testnet_payout') as 'claim_testnet_payout',
    complete: (m ? 'complete_mainnet_payout' : 'complete_testnet_payout') as 'complete_testnet_payout',
    accept: (m ? 'accept_mainnet_hub_result' : 'accept_testnet_hub_result') as 'accept_testnet_hub_result',
    reopen: (m ? 'reopen_unbroadcast_mainnet_payout' : 'reopen_unbroadcast_testnet_payout') as 'reopen_unbroadcast_testnet_payout',
  };
}
/** Server-only: read inside handlers. */
export function netEnv(n: Net, key: 'RPC_URL' | 'RPC_AUTHORIZATION' | 'MANUAL_PAYOUTS_ENABLED') {
  return process.env[(n === 'mainnet' ? 'NIMIQ_MAINNET_' : 'NIMIQ_TESTNET_') + key];
}
export const payoutsEnabled = (n: Net) => netEnv(n, 'MANUAL_PAYOUTS_ENABLED') === 'true';
export const netLabel = (n: Net) => (n === 'mainnet' ? 'mainnet' : 'testnet');
