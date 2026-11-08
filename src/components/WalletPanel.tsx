import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { connectWallet, hostNetwork, signWalletChallenge, walletError, type Network } from "@/lib/nimiq";
import { createWalletChallenge, verifyWalletChallenge } from "@/lib/nimiq/wallet.functions";
import { isValidNimiqAddress, normalizeAddress } from "@/lib/nimiq/rules";
import { beginHubOwnership } from '@/lib/nimiq/hub.functions';
import { openHub, requireHubBrowser } from '@/lib/nimiq/hub';

export function WalletPanel() {
  const qc = useQueryClient();
  const createChallenge = useServerFn(createWalletChallenge);
  const verifyChallenge = useServerFn(verifyWalletChallenge);
  const hubOwnership = useServerFn(beginHubOwnership);
  const [webReserve, setWebReserve] = useState('');
  const [network, setNetwork] = useState<Network | undefined>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [reserve, setReserve] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const links = useQuery({ queryKey: ["wallet-links"], queryFn: async () => {
    const { data, error } = await supabase.from("nimiq_wallet_links").select("*").order("verified_at", { ascending: false });
    if (error) throw error;
    return data;
  } });
  useEffect(() => { void hostNetwork().then(setNetwork); }, []);
  async function connect() {
    setBusy(true); setStatus("Waiting for Nimiq Pay…");
    try {
      const result = await connectWallet();
      setAccounts(result.accounts); setNetwork(result.network);
      setSelected(result.accounts[0] ?? "");
      setReserve(result.accounts[0] ?? "");
      setStatus("Address shared. Ownership not yet verified.");
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); }
  }
  async function prove(purpose: "connect" | "reserve") {
    const address = normalizeAddress(purpose === "reserve" ? reserve : selected);
    if (!network || !isValidNimiqAddress(address)) { setStatus("Choose a valid wallet address and connect Nimiq Pay first."); return; }
    setBusy(true);
    try {
      if (await hostNetwork() !== network) throw new Error("Wallet network changed. Connect again.");
      setStatus("Approve the ownership message in Nimiq Pay…");
      const challenge = await createChallenge({ data: { address, network, purpose } });
      const signed = await signWalletChallenge(challenge.message);
      const result = await verifyChallenge({ data: { id: challenge.id, publicKey: signed.publicKey, signature: signed.signature } });
      setStatus(`${purpose === "reserve" ? "Reserve" : "Wallet"} ownership verified on ${result.network}.`);
      await qc.invalidateQueries({ queryKey: ["wallet-links"] });
      toast.success("Wallet ownership verified");
    } catch (error) { setStatus(await walletError(error)); }
    finally { setBusy(false); }
  }
  const visible = (links.data ?? []).filter((link) => !network || link.network === network);
  async function proveWebReserve() {
    setBusy(true);
    try {
      await requireHubBrowser();
      const intent = await hubOwnership({ data: { address: webReserve, purpose: 'reserve' } });
      await openHub(intent);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Browser wallet unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 space-y-3 rounded-sm border p-4">
    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Nimiq wallet {network && `· ${network}`}</p>
    {visible.map((link) => <div key={link.id} className="text-xs">
      <p className="flex items-center gap-2 text-gold"><ShieldCheck size={14} />{link.is_reserve ? "Verified Reserve" : "Verified wallet"} · {link.network}</p>
      <p className="mt-1 break-all font-mono text-ivory">{link.address}</p>
    </div>)}
    {!visible.length && <p className="text-sm text-muted-foreground">Not connected — open NIMAURA inside Nimiq Pay</p>}
    <Button variant="outline" disabled={busy} onClick={connect}><Wallet />Connect wallet</Button>
    {accounts.length > 0 && <>
      <label className="block text-xs text-muted-foreground">Shared wallet address
        <select aria-label="Shared wallet address" className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-2 font-mono text-xs text-ivory" value={selected} onChange={(event) => setSelected(event.target.value)}>
          {accounts.map((address) => <option key={address}>{address}</option>)}
        </select>
      </label>
      <Button variant="outline" disabled={busy} onClick={() => prove("connect")}><ShieldCheck />Verify wallet ownership</Button>
      <label className="block text-xs text-muted-foreground">Reserve address (your own wallet)
        <input aria-label="Reserve address" className="mt-1 w-full rounded-sm border border-input bg-card px-3 py-2 font-mono text-xs text-ivory" value={reserve} onChange={(event) => setReserve(event.target.value)} />
      </label>
      <Button variant="outline" disabled={busy} onClick={() => prove("reserve")}><ShieldCheck />Verify Reserve address</Button>
    </>}
    <label className="block text-xs text-muted-foreground">Testnet web-wallet Reserve address
      <input aria-label="Testnet web-wallet Reserve address" value={webReserve} onChange={e => setWebReserve(e.target.value)} className="mt-1 w-full rounded-sm border border-input bg-card px-3 py-2 font-mono text-xs text-ivory" />
    </label>
    <Button variant="outline" disabled={busy || !isValidNimiqAddress(webReserve)} onClick={proveWebReserve}><ShieldCheck />Verify testnet Reserve · browser only</Button>
    {status && <p role="status" className="break-words text-xs text-muted-foreground">{status}</p>}
    <p className="text-xs text-muted-foreground">NIMAURA never asks for your private key or recovery phrase.</p>
  </section>;
}