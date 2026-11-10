import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPayouts, reconcilePayout, reopenPayout } from "@/lib/nimiq/payouts.functions";
import { walletError } from "@/lib/nimiq";
import { beginHubOwnership, beginHubPayout } from '@/lib/nimiq/hub.functions';
import { openHub, requireHubBrowser } from '@/lib/nimiq/hub';
import { useDeliveryFeedback } from '@/lib/nimiq/use-delivery-feedback';

export function TestnetPayoutQueue() {
  const list = useServerFn(listPayouts), approve = useServerFn(beginHubPayout), reconcile = useServerFn(reconcilePayout), reopen = useServerFn(reopenPayout);
  const treasuryProof = useServerFn(beginHubOwnership);
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["testnet-payout-queue"], queryFn: () => list() });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [hashes, setHashes] = useState<Record<string,string>>({});
  const { feedback, remainingSeconds } = useDeliveryFeedback();
  async function act(id: string, send: boolean) {
    if (busy || (!send && remainingSeconds > 0)) return;
    setBusy(true); setMessage("");
    try {
      let hash: string | undefined = hashes[id] || undefined;
      if (send) {
        await requireHubBrowser();
        const intent = await approve({ data: { id } });
        await openHub(intent);
        return;
      }
      const result = await reconcile({ data: { id, ...(hash ? { txHash: hash } : {}) } });
      setMessage(feedback(result));
    } catch (error) { setMessage(await walletError(error)); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ["testnet-payout-queue"] }); }
  }
  async function reopenClaim(id: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const r = await reopen({ data: { id } });
      setMessage(r.status === "queued" ? "No transfer was signed or found on testnet. This payout is queued again; approve it when ready." : feedback(r));
    } catch (e) { setMessage(await walletError(e)); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ["testnet-payout-queue"] }); }
  }
  async function proveTreasury(id: string, address: string) {
    setBusy(true);
    try { await requireHubBrowser(); await openHub(await treasuryProof({ data: { address, purpose: 'treasury', payoutId: id } })); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Treasury proof unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 space-y-4 border-t pt-6">
    <h2 className="font-display text-2xl text-ivory">Testnet payout queue</h2>
    {queue.error && <p role="alert" className="text-sm text-warning">Queue unavailable.</p>}
    {!queue.data?.length && <p className="text-sm text-muted-foreground">No testnet payouts.</p>}
    <ul className="divide-y">{queue.data?.map((p) => <li key={p.id} className="space-y-2 py-4">
      <p className="text-sm text-ivory">{p.amount_luna / 100_000} test NIM · {p.status}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">From: {p.treasury_sender}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">To: {p.reserve_destination}</p>
      <p className="break-all font-mono text-xs text-muted-foreground">{p.reference}</p>
      {p.tx_hash && <p className="break-all font-mono text-xs text-muted-foreground">Saved transaction: {p.tx_hash}</p>}
      {p.status === "queued" && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => proveTreasury(p.id, p.treasury_sender)}>Verify treasury · browser only</Button>
        <Button variant="outline" disabled={busy} onClick={() => act(p.id, true)}><Send />Approve payout · browser only</Button>
      </div>}
      {p.status === "uncertain" && <>
        <label className="block text-xs text-muted-foreground">Known transaction hash (optional)
          <input aria-label={`Transaction hash ${p.reference}`} value={hashes[p.id] ?? ""} onChange={(e) => setHashes((old) => ({ ...old, [p.id]: e.target.value }))} className="mt-1 w-full rounded-sm border border-input bg-card p-2 font-mono text-xs" />
        </label>
        <Button variant="outline" disabled={busy || remainingSeconds > 0 || (!!hashes[p.id] && !/^[a-f0-9]{64}$/i.test(hashes[p.id] ?? ""))} onClick={() => act(p.id, false)}><RefreshCw />{remainingSeconds > 0 ? `Check again in ${remainingSeconds}s` : 'Reconcile delivery'}</Button>
        {!p.tx_hash && p.expires_at && Date.parse(p.expires_at) <= Date.now() && <Button variant="outline" disabled={busy} onClick={() => reopenClaim(p.id)}>Reopen unsigned claim</Button>}
      </>}
    </li>)}</ul>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}