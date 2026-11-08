import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createPaymentQuote, getPaymentState, preparePayment, checkPayment } from "@/lib/nimiq/payments.functions";
import { hostNetwork, initiatePayment, walletError, type Network, type Quote } from "@/lib/nimiq";
import { LUNA_PER_NIM } from "@/lib/nimiq/rules";
import type { Intention } from "@/lib/manifest";

export function PaymentPanel({ dropId, intention, onFulfilled }: { dropId: string; intention: Intention | null; onFulfilled: (id: string) => void }) {
  const quoteFn = useServerFn(createPaymentQuote);
  const stateFn = useServerFn(getPaymentState);
  const prepareFn = useServerFn(preparePayment);
  const checkFn = useServerFn(checkPayment);
  const [network, setNetwork] = useState<Network | undefined>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [hash, setHash] = useState("");
  useEffect(() => {
    void hostNetwork().then(async (active) => {
      setNetwork(active);
      if (!active) return;
      try { const saved = await stateFn({ data: { network: active } }); setQuote(saved); setHash(saved?.txHash ?? ""); }
      catch { setStatus("Could not load payment status. Check again before paying."); }
    });
  }, [stateFn]);
  async function loadQuote() {
    if (!intention) return;
    setBusy(true); setStatus("");
    try {
      const active = await hostNetwork();
      if (!active) throw new Error("Open NIMAURA inside an updated Nimiq Pay app.");
      setNetwork(active);
      const { data: wallets } = await supabase.from("nimiq_wallet_links").select("address").eq("network", active).order("verified_at", { ascending: false });
      const wallet = wallets?.[0];
      if (!wallet) throw new Error("Verify your wallet in Account first.");
      setQuote(await quoteFn({ data: { network: active, address: wallet.address, dropId, intention } }));
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); }
  }
  async function check(id = quote?.id, txHash = hash) {
    if (!id) return;
    setBusy(true);
    try {
      const result = await checkFn({ data: { id, ...(txHash ? { txHash } : {}) } });
      setQuote(result); setHash(result.txHash ?? txHash);
      if (result.manifestationId) onFulfilled(result.manifestationId);
      else setStatus(result.status === "fulfilled" ? "Testnet payment verified. Test Reserve payout queued; no real collectible or savings issued." : "Payment pending. Do not pay again; check status shortly.");
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!quote) return;
    setBusy(true);
    try {
      // Persist pending before the wallet dialog so interruption cannot produce a second request.
      const pending = await prepareFn({ data: { id: quote.id } });
      setQuote(pending); setStatus("Approve payment in Nimiq Pay…");
      const txHash = await initiatePayment(pending);
      setHash(txHash);
      await check(pending.id, txHash);
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-y py-5">
    <p className="eyebrow">Testnet payment · $1 USD equivalent {network && `· ${network}`}</p>
    {!quote ? <Button variant="outline" className="w-full" disabled={!intention || busy} onClick={loadQuote}><RefreshCw />Get live NIM quote</Button> : <>
      <dl className="space-y-2 text-sm">
        <Row label="You pay" value={`${(quote.amountLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="Reserve allocation (50%)" value={`${(quote.savingsLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="NIMAURA allocation (50%)" value={`${(quote.savingsLuna / LUNA_PER_NIM).toLocaleString()} NIM`} />
        <Row label="Network" value={quote.network} />
        <Row label="Quote expires" value={new Date(quote.expiresAt).toLocaleTimeString()} />
      </dl>
      <p className="break-all font-mono text-xs text-muted-foreground">To: {quote.recipient}</p>
      <p className="text-xs text-muted-foreground">Network fee is shown in Nimiq Pay. Reserve transfers are not active; allocation is not savings delivered.</p>
      {quote.status === "fulfilled" ? <p className="text-xs text-gold">Test payment verified · Reserve payout queued</p> : quote.status === "quoted" ? <Button disabled={busy} className="w-full" onClick={pay}><CreditCard />Pay with Nimiq Pay</Button> : <>
        <p className="text-xs text-warning">{quote.status === "verified" ? "Verified testnet payment" : "Payment pending — do not pay again"}</p>
        <label className="block text-xs text-muted-foreground">Transaction hash
          <input aria-label="Transaction hash" className="mt-1 w-full rounded-sm border border-input bg-card px-3 py-2 font-mono text-xs text-ivory" value={hash} disabled={!!quote.txHash} onChange={(event) => setHash(event.target.value)} />
        </label>
        <Button variant="outline" className="w-full" disabled={busy || (hash.length > 0 && !/^[a-f0-9]{64}$/i.test(hash))} onClick={() => check()}><RefreshCw />Check payment status</Button>
      </>}
    </>}
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
    <Link to="/account" className="block text-xs text-gold">Wallet &amp; Reserve verification →</Link>
  </section>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right text-ivory">{value}</dd></div>; }