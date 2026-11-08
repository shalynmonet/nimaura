import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/AppShell';
import { recoverHubResponse, type HubResponse } from '@/lib/nimiq/hub';
import { completeHubResult, hubRecovery } from '@/lib/nimiq/hub.functions';
import { reconcilePayout } from '@/lib/nimiq/payouts.functions';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/hub-return')({
  head: () => ({ meta: [{ title: 'Testnet wallet return — NIMAURA' }, { name: 'description', content: 'Confirm a testnet web-wallet ownership proof or reconcile a treasury-approved payout.' }, { property: 'og:title', content: 'Testnet wallet return — NIMAURA' }, { property: 'og:description', content: 'Confirm a testnet wallet approval securely.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: HubReturn,
});
function HubReturn() {
  const complete = useServerFn(completeHubResult), recover = useServerFn(hubRecovery), reconcile = useServerFn(reconcilePayout);
  const [result, setResult] = useState<HubResponse | null>(null), [signedIn, setSignedIn] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('Waiting for the testnet wallet return.');
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => { if (live) setSignedIn(!!data.session); });
    void recoverHubResponse(r => { if (live) { setResult(r); setMessage('Wallet approval returned.'); } }, e => { if (live) setMessage(e.message); }).catch(e => { if (live) setMessage(e instanceof Error ? e.message : 'Wallet return unavailable.'); });
    return () => { live = false; };
  }, []);
  async function confirm() {
    setBusy(true);
    try {
      const id = result?.id ?? sessionStorage.getItem('nimaura-hub-pending');
      if (!id) throw new Error('No pending wallet request in this browser.');
      const state = await recover({ data: { id } });
      if (!state.consumed) {
        if (state.expired || !result) throw new Error('Approval expired or missing. Any payout claim stays unresolved; do not resend.');
        await complete({ data: result });
      }
      if (state.kind === 'payout' && state.payoutId) {
        const outcome = await reconcile({ data: { id: state.payoutId } });
        setMessage(outcome.status === 'paid' ? 'Finalized testnet delivery confirmed.' : 'Stored transaction remains unresolved. Check delivery again; never resend.');
      } else setMessage('Testnet wallet ownership verified.');
      sessionStorage.removeItem('nimaura-hub-result');
      setResult(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Approval unresolved.'); }
    finally { setBusy(false); }
  }
  return <AppShell><section className="mt-8 space-y-5">
    <h1 className="font-display text-3xl text-ivory">Testnet wallet approval</h1>
    <p role="status" className="text-sm text-muted-foreground break-words">{message}</p>
    {signedIn ? <Button variant="outline" disabled={busy} onClick={confirm}>Confirm approval / check delivery</Button> : <Link to="/auth" search={{ redirect: '/hub-return' }} className="text-gold underline">Sign in to confirm approval</Link>}
    <p><Link to="/account" className="text-gold underline">Back to account</Link></p>
  </section></AppShell>;
}