import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createPaymentQuote, getPaymentState, preparePayment, checkPayment, recordSubmission, releaseUnmatchedPurchase } from "@/lib/nimiq/payments.functions";
import { hostNetwork, initiatePayment, walletError, type Network, type Quote } from "@/lib/nimiq";
import { LUNA_PER_NIM } from "@/lib/nimiq/rules";
import { WALLET_WATCHDOG_MS, submissionMessage, classifySubmissionError, candidateStorageKey, singleFlight } from "@/lib/nimiq/submission";
import type { Intention } from "@/lib/manifest";

export function PaymentPanel({ dropId, intention, onFulfilled }: { dropId: string; intention: Intention | null; onFulfilled: (id: string) => void }) {
  const recordFn = useServerFn(recordSubmission);
  const flight = useRef(singleFlight());
  const checking = useRef(false);
  const userId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const quoteFn = useServerFn(createPaymentQuote);
  const stateFn = useServerFn(getPaymentState);
  const prepareFn = useServerFn(preparePayment);
  const checkFn = useServerFn(checkPayment);
  const releaseFn = useServerFn(releaseUnmatchedPurchase);
  const [network, setNetwork] = useState<Network | undefined>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [hash, setHash] = useState("");
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser(); userId.current = auth.user?.id ?? null;
      const active = await hostNetwork() ?? 'testnet'; setNetwork(active);
      try {
        const latest = await stateFn({ data: { network: active } });
        // A finished purchase belongs in the Vault; the panel starts fresh for the next one.
        const saved = latest?.status === 'fulfilled' ? null : latest; setQuote(saved);
        const local = saved && userId.current ? localStorage.getItem(candidateStorageKey(userId.current, saved.id)) : null;
        setHash(saved?.txHash ?? saved?.candidateTxHash ?? local ?? '');
      } catch { setHistoryFailed(true); setStatus('Could not load payment status. Reload to recover it; new payments are locked.'); }
      finally { setLoaded(true); }
    })();
  }, [stateFn]);
  useEffect(() => {
    if (!quote || quote.status !== 'pending') return;
    const tick = () => {
      if (document.hidden || checking.current || Date.now() < retryUntil) return;
      if (quote.submissionOutcome === 'awaiting_wallet' && quote.submissionStartedAt && Date.now() - Date.parse(quote.submissionStartedAt) < WALLET_WATCHDOG_MS) return;
      void check();
    };
    const timer = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [quote, hash, retryUntil]);
  async function loadQuote() {
    if (!intention || !loaded || historyFailed || quote?.status === "pending" || !flight.current.enter()) return;
    setBusy(true); setStatus("");
    try {
      const active = await hostNetwork();
      if (!active) throw new Error("Open NIMAURA inside an updated Nimiq Pay app.");
      setNetwork(active);
      const { data: wallets } = await supabase.from("nimiq_wallet_links").select("address").eq("network", active).eq("is_reserve", false).order("verified_at", { ascending: false });
      const wallet = wallets?.[0];
      if (!wallet) throw new Error("Verify your wallet in Account first.");
      setQuote(await quoteFn({ data: { network: active, address: wallet.address, dropId, intention } }));
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); flight.current.leave(); }
  }
  async function check(id = quote?.id, txHash = hash) {
    if (!id || checking.current) return;
    checking.current = true;
    setBusy(true);
    try {
      if (txHash && !quote?.candidateTxHash && !quote?.txHash) await recordFn({ data: { id, outcome: 'hash_received', txHash } });
      const result = await checkFn({ data: { id, ...(txHash ? { txHash } : {}) } });
      setQuote(result); setHash(result.txHash ?? result.candidateTxHash ?? txHash); setRetryUntil(Date.now() + Math.max(10000, result.retryAfterMs ?? 10000));
      if (result.manifestationId) onFulfilled(result.manifestationId);
      else setStatus(result.status === "fulfilled" ? "Testnet collectible issued. Reserve allocation queued, not delivered savings." : result.submissionDetail ?? submissionMessage(result.submissionOutcome, !!(result.txHash ?? result.candidateTxHash)));
    } catch (error) { setStatus(await walletError(error)); setRetryUntil(Date.now() + 30000); }
    finally { setBusy(false); checking.current = false; }
  }
  async function release() {
    if (!quote || !flight.current.enter()) return;
    setBusy(true);
    try {
      await releaseFn({ data: { id: quote.id } });
      setQuote(null); setHash(""); setRetryUntil(0);
      setStatus("Purchase released: its payment window closed with no matching transfer. No matching payment reached the receiving wallet. You can get a new quote.");
    } catch (error) { setStatus(await walletError(error)); setRetryUntil(Date.now() + 30000); }
    finally { setBusy(false); flight.current.leave(); }
  }
  async function pay() {
    if (!quote || quote.status !== 'quoted' || !flight.current.enter()) return;
    setBusy(true);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    try {
      const pending = await prepareFn({ data: { id: quote.id } }); started = true;
      setQuote(pending); setStatus(submissionMessage('awaiting_wallet', false));
      watchdog = setTimeout(() => {
        setBusy(false); setStatus(submissionMessage('unknown', false));
        void recordFn({ data: { id: pending.id, outcome: 'unknown', detail: 'Wallet call has not resolved within 30 seconds.' } }).catch(() => {});
      }, WALLET_WATCHDOG_MS);
      // Watchdog does not cancel the call: a late hash is still durably recovered.
      const txHash = await initiatePayment(pending);
      if (!/^[a-f0-9]{64}$/i.test(txHash)) throw new Error('Wallet returned no valid transaction hash; submission outcome unknown.');
      setHash(txHash);
      try { if (userId.current) localStorage.setItem(candidateStorageKey(userId.current, pending.id), txHash); } catch { /* backend persistence below remains required */ }
      await recordFn({ data: { id: pending.id, outcome: 'hash_received', txHash } });
      setQuote({ ...pending, candidateTxHash: txHash, submissionOutcome: 'hash_received' });
      await check(pending.id, txHash);
    } catch (error) {
      const outcome = classifySubmissionError(error);
      if (started) await recordFn({ data: { id: quote.id, outcome, detail: (error instanceof Error ? error.message : 'Wallet request did not complete').slice(0,240) } }).catch(() => {});
      setStatus(started ? `${submissionMessage(outcome, !!hash)} ${error instanceof Error ? error.message : ''}` : await walletError(error));
    } finally { if (watchdog) clearTimeout(watchdog); setBusy(false); flight.current.leave(); }
  }
  return <section className="space-y-3 border-y py-5">
    <p className="eyebrow">Testnet payment · $1 USD equivalent {network && `· ${network}`}</p>
    {!quote ? <><Button variant="outline" className="w-full" disabled={!loaded || historyFailed || !intention || busy} onClick={loadQuote}><RefreshCw />Get live NIM quote</Button>{!quote && loaded && !intention && <p className="text-xs text-muted-foreground">Choose Become, Release, Receive, or Remember above to get a quote.</p>}</> : <>
      <dl className="space-y-2 text-sm">
        <Row label="You pay" value={`${(quote.amountLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="Reserve allocation (50%)" value={`${(quote.savingsLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="NIMAURA allocation (50%)" value={`${(quote.savingsLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="Network" value={quote.network} />
        <Row label="Quote expires" value={new Date(quote.expiresAt).toLocaleTimeString()} />
      </dl>
      <p className="break-all font-mono text-xs text-muted-foreground">To: {quote.recipient}</p>
      <p className="text-xs text-muted-foreground">Network fee is shown in Nimiq Pay. Reserve transfers are not active; allocation is not savings delivered.</p>
      {quote.status === "fulfilled" ? <><p className="text-xs text-gold">Test payment verified · Reserve payout queued</p><Button variant="outline" className="w-full" disabled={busy} onClick={loadQuote}><RefreshCw />Get live NIM quote</Button></> : quote.status === "quoted" ? <Button disabled={busy} className="w-full" onClick={pay}><CreditCard />Pay with Nimiq Pay</Button> : <>
        <p className="text-xs text-warning">{quote.status === "verified" ? "Verified payment awaiting fulfillment" : submissionMessage(quote.submissionOutcome, !!(quote.txHash ?? quote.candidateTxHash ?? hash))}</p>
        <label className="block text-xs text-muted-foreground">Transaction hash
          <input aria-label="Transaction hash" className="mt-1 w-full rounded-sm border border-input bg-card px-3 py-2 font-mono text-xs text-ivory" value={hash} disabled={!!(quote.txHash ?? quote.candidateTxHash)} onChange={(event) => setHash(event.target.value)} />
        </label>
        <Button variant="outline" className="w-full" disabled={busy || now < retryUntil || (hash.length > 0 && !/^[a-f0-9]{64}$/i.test(hash))} onClick={() => check()}><RefreshCw />{now < retryUntil ? `Check again in ${Math.ceil((retryUntil - now) / 1000)}s` : "Check payment status"}</Button>
        {quote.status === "pending" && !hash && !quote.canRelease && quote.releaseAfterHeight && quote.headHeight !== undefined && quote.releaseAfterHeight > quote.headHeight && <p className="text-xs text-muted-foreground">If no payment appears, you can release this purchase after testnet block {quote.releaseAfterHeight.toLocaleString()} (about {Math.ceil((quote.releaseAfterHeight - quote.headHeight) / 60)} min). Until then the wallet could still deliver it.</p>}
        {quote.status === "pending" && !hash && quote.canRelease && <Button variant="outline" className="w-full" disabled={busy} onClick={release}>Release this purchase</Button>}
      </>}
    </>}
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    <Link to="/account" className="block text-xs text-gold">Wallet &amp; Reserve verification →</Link>
  </section>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right text-ivory">{value}</dd></div>; }