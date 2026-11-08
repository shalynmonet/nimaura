import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPayouts, claimPayout, reconcilePayout } from "@/lib/nimiq/payouts.functions";
import { hostNetwork, initiatePayout, signWalletChallenge, walletError } from "@/lib/nimiq";
import { createWalletChallenge, verifyWalletChallenge } from "@/lib/nimiq/wallet.functions";

export function TestnetPayoutQueue() {
  const list = useServerFn(listPayouts), claim = useServerFn(claimPayout), reconcile = useServerFn(reconcilePayout);
  const challenge = useServerFn(createWalletChallenge), verifyWallet = useServerFn(verifyWalletChallenge);
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["testnet-payout-queue"], queryFn: () => list() });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [hashes, setHashes] = useState<Record<string,string>>({});
  async function act(id: string, send: boolean) {
    setBusy(true); setMessage("");
    try {
      let hash: string | undefined = hashes[id] || undefined;
      if (send) {
        if (await hostNetwork() !== "testnet") throw new Error("Open the treasury wallet in Nimiq Pay testnet.");
        const item = queue.data?.find((p) => p.id === id);
        if (!item) throw new Error("Reload the queue.");
        // Prove Pay's current signer is treasury before claiming or opening a transfer dialog.
        // Separate web Wallets cannot pass this via collector Pay; they require Hub support.
        const proof = await challenge({ data: { address: item.treasury_sender, network: "testnet", purpose: "connect" } });
        const signed = await signWalletChallenge(proof.message);
        await verifyWallet({ data: { id: proof.id, publicKey: signed.publicKey, signature: signed.signature } });
        const payout = await claim({ data: { id } });
        // Claim is uncertain before any wallet request. Errors never return it to queued.
        hash = await initiatePayout(payout);
      }
      const result = await reconcile({ data: { id, ...(hash ? { txHash: hash } : {}) } });
      setMessage(result.status === "paid" ? "Finalized testnet delivery confirmed." : "Delivery unresolved. Reconcile again; do not resend.");
    } catch (error) { setMessage(await walletError(error)); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ["testnet-payout-queue"] }); }
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
      {p.status === "queued" && <Button variant="outline" disabled={busy} onClick={() => act(p.id, true)}><Send />Approve in treasury wallet</Button>}
      {p.status === "uncertain" && <>
        <label className="block text-xs text-muted-foreground">Known transaction hash (optional)
          <input aria-label={`Transaction hash ${p.reference}`} value={hashes[p.id] ?? ""} onChange={(e) => setHashes((old) => ({ ...old, [p.id]: e.target.value }))} className="mt-1 w-full rounded-sm border border-input bg-card p-2 font-mono text-xs" />
        </label>
        <Button variant="outline" disabled={busy || (!!hashes[p.id] && !/^[a-f0-9]{64}$/i.test(hashes[p.id] ?? ""))} onClick={() => act(p.id, false)}><RefreshCw />Reconcile delivery</Button>
      </>}
    </li>)}</ul>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}