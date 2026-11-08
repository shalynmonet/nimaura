import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { isValidNimiqAddress, normalizeAddress, requireUnexpired } from './rules';
import { verifyWalletSignature } from './verification';
import { networkHead, rpc, type TrustedRpc } from './rpc.server';
import { verifyHubTransaction } from './hub-verification';
import type { HubIntent } from './hub';

const idInput = z.object({ id: z.string().uuid() });
export const beginHubOwnership = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ address: z.string().transform(normalizeAddress).refine(isValidNimiqAddress), purpose: z.enum(['reserve', 'treasury']), payoutId: z.string().uuid().optional() }).strict())
  .handler(async ({ data, context }): Promise<HubIntent> => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let address = data.address;
    if (data.purpose === 'treasury') {
      const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
      if (role.error || !role.data || !data.payoutId) throw new Error('Admin and payout required.');
      const payout = await context.supabase.from('testnet_payouts').select('treasury_sender,network').eq('id', data.payoutId).single();
      if (!payout.data || payout.data.network !== 'testnet') throw new Error('Testnet payout required.');
      address = payout.data.treasury_sender; // Never accept a client treasury override.
    }
    const recent = await supabaseAdmin.from('testnet_hub_requests').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).gte('created_at', new Date(Date.now() - 300_000).toISOString());
    if (recent.error || (recent.count ?? 0) >= 10) throw new Error('Too many wallet requests. Try again later.');
    const id = crypto.randomUUID(), challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const purpose = data.purpose === 'reserve' ? 'reserve' : 'connect';
    const message = `NIMAURA wallet ownership\nCollector: ${context.userId}\nAddress: ${address}\nNetwork: testnet\nPurpose: ${purpose}\nChallenge: ${challengeId}\nExpires: ${expiresAt}\nThis verifies ownership only. It does not authorize payments.`;
    const challenge = await supabaseAdmin.from('nimiq_wallet_challenges').insert({ id: challengeId, user_id: context.userId, address, network: 'testnet', purpose, message, expires_at: expiresAt });
    if (challenge.error) throw new Error('Could not create challenge.');
    const request = await supabaseAdmin.from('testnet_hub_requests').insert({ id, user_id: context.userId, kind: 'ownership', challenge_id: challengeId, expires_at: expiresAt });
    if (request.error) throw new Error('Could not bind wallet request.');
    return { id, kind: 'ownership', signer: address, message };
  });

export const beginHubPayout = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idInput.strict()).handler(async ({ data, context }): Promise<HubIntent> => {
  const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (role.error || role.data !== true) throw new Error('Admin required.');
  if (process.env['NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED'] !== 'true') throw new Error('Manual testnet payouts are disabled.');
  const p = await context.supabase.from('testnet_payouts').select('*').eq('id', data.id).single();
  if (!p.data || p.error || p.data.network !== 'testnet' || p.data.status !== 'queued') throw new Error('Queued testnet payout required. Reconcile existing claims.');
  const link = await context.supabase.from('nimiq_wallet_links').select('id').eq('user_id', context.userId).eq('address', p.data.treasury_sender).eq('network', 'testnet').maybeSingle();
  if (!link.data || link.error) throw new Error('Verify treasury ownership in the browser first.');
  const url = process.env['NIMIQ_TESTNET_RPC_URL'];
  if (!url) throw new Error('Trusted testnet RPC required.');
  const head = await networkHead({ url, authorization: process.env['NIMIQ_TESTNET_RPC_AUTHORIZATION'] }, 'testnet');
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const claim = await supabaseAdmin.rpc('claim_testnet_payout', { _id: data.id, _operator: context.userId, _height: head.number, _expires: expiresAt });
  if (claim.error) throw new Error('Already claimed. Reconcile; never resend.');
  const id = crypto.randomUUID();
  const request = await supabaseAdmin.from('testnet_hub_requests').insert({ id, user_id: context.userId, kind: 'payout', payout_id: data.id, expires_at: expiresAt });
  if (request.error) throw new Error('Wallet request unavailable. Claim remains unresolved; do not resend.');
  return { id, kind: 'payout', signer: p.data.treasury_sender, recipient: p.data.reserve_destination, amountLuna: p.data.amount_luna, reference: p.data.reference, validityStartHeight: head.number };
});

const resultInput = z.discriminatedUnion('kind', [
  idInput.extend({ kind: z.literal('ownership'), signer: z.string().transform(normalizeAddress).refine(isValidNimiqAddress), publicKey: z.string().regex(/^[a-f0-9]{64}$/i), signature: z.string().regex(/^[a-f0-9]{128}$/i) }).strict(),
  idInput.extend({ kind: z.literal('payout'), serializedTx: z.string().max(4096).regex(/^(?:[a-f0-9]{2})+$/i), hash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict(),
]);
export const completeHubResult = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(resultInput).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const req = await supabaseAdmin.from('testnet_hub_requests').select('*').eq('id', data.id).eq('user_id', context.userId).single();
  const r = req.data;
  if (!r || req.error || r.kind !== data.kind) throw new Error('Wallet return unavailable.');
  if (r.consumed_at) throw new Error('Wallet return already used. Check recovery status; never send again.');
  requireUnexpired(r.expires_at);
  if (data.kind === 'ownership') {
    if (!r.challenge_id) throw new Error('Missing challenge.');
    const challenge = await supabaseAdmin.from('nimiq_wallet_challenges').select('*').eq('id', r.challenge_id).eq('user_id', context.userId).single();
    const c = challenge.data;
    if (!c || c.network !== 'testnet' || c.consumed_at || c.address !== data.signer || !verifyWalletSignature(c.message, c.address, data.publicKey, data.signature)) throw new Error('The selected web wallet did not prove this address.');
    requireUnexpired(c.expires_at);
    const accepted = await supabaseAdmin.rpc('accept_testnet_hub_result', { _id: r.id, _user: context.userId, _key: data.publicKey.toLowerCase(), _hash: '', _bytes: '' });
    if (accepted.error) throw new Error('Challenge expired or already consumed.');
    return { status: 'verified', payoutId: null };
  }
  const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (role.error || role.data !== true) throw new Error('Admin required.');
  if (process.env['NIMIQ_TESTNET_MANUAL_PAYOUTS_ENABLED'] !== 'true') throw new Error('Manual testnet payouts are disabled.');
  if (!r.payout_id) throw new Error('Missing payout.');
  const p = (await supabaseAdmin.from('testnet_payouts').select('*').eq('id', r.payout_id).single()).data;
  if (!p || p.status !== 'uncertain' || p.claimed_by !== context.userId || p.validity_start_height === null || !p.expires_at || p.network !== 'testnet') throw new Error('Original testnet claim required.');
  requireUnexpired(p.expires_at);
  const verified = verifyHubTransaction(data.serializedTx, data.hash, { sender: p.treasury_sender, recipient: p.reserve_destination, amountLuna: p.amount_luna, reference: p.reference, validityStartHeight: p.validity_start_height });
  const url = process.env['NIMIQ_TESTNET_RPC_URL'];
  if (!url) throw new Error('Trusted testnet RPC required.');
  const service: TrustedRpc = { url, authorization: process.env['NIMIQ_TESTNET_RPC_AUTHORIZATION'] };
  await networkHead(service, 'testnet');
  // SQL consumes one-use state, pins hash and stores private bytes under the original atomic claim.
  // Only the winning insert is allowed ONE broadcast. Crashes and unknown results never retry.
  const accepted = await supabaseAdmin.rpc('accept_testnet_hub_result', { _id: r.id, _user: context.userId, _key: '', _hash: verified.hash, _bytes: verified.serializedTx });
  if (accepted.error) throw new Error('Result already stored or claim changed. Reconcile; never resend.');
  try {
    await rpc(service, 'sendRawTransaction', [verified.serializedTx], z.string().regex(/^[a-f0-9]{64}$/i).refine(h => h.toLowerCase() === verified.hash));
  } catch { return { status: 'uncertain', payoutId: p.id }; }
  return { status: 'broadcast', payoutId: p.id };
});

export const hubRecovery = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idInput).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = (await supabaseAdmin.from('testnet_hub_requests').select('kind,consumed_at,expires_at,payout_id').eq('id', data.id).eq('user_id', context.userId).single()).data;
  if (!r) throw new Error('Wallet request unavailable.');
  return { kind: r.kind, consumed: !!r.consumed_at, expired: Date.parse(r.expires_at) <= Date.now(), payoutId: r.payout_id };
});