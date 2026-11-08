import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/reserve")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "My Reserve — NIMAURA" },
      { name: "description", content: "Verified NIM savings sent to your own wallet." },
      { property: "og:title", content: "My Reserve — NIMAURA" },
      { property: "og:description", content: "Verified NIM savings sent to your own wallet." },
    ],
  }),
  component: Reserve,
});

function Reserve() {
  const profile = useQuery(profileQuery());
  const wallets = useQuery({ queryKey: ["wallet-links"], queryFn: async () => {
    const { data, error } = await supabase.from("nimiq_wallet_links").select("*").eq("is_reserve", true);
    if (error) throw error;
    return data;
  } });
  const t = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_transfers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const real = (t.data ?? []).filter((x) => !x.is_simulated && x.status === "verified");
  const sim = (t.data ?? []).filter((x) => x.is_simulated);
  const sum = (a: typeof real) => a.reduce((s, x) => s + Number(x.nim_amount), 0);
  const goal = profile.data?.savings_goal_nim ? Number(profile.data.savings_goal_nim) : null;
  const realSum = sum(real);

  return (
    <AppShell>
      <section className="mt-6">
        <p className="eyebrow">Held in your own wallet</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">My Reserve</h1>
      </section>

      <div className="glow-gold mt-6 rounded-sm border border-gold/50 bg-card p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Verified savings</p>
        <p className="mt-2 font-display text-5xl text-ivory tabular-nums">{realSum.toLocaleString()} <span className="text-2xl text-gold">NIM</span></p>
        <p className="mt-2 text-xs text-muted-foreground">Only transfers verified on the Nimiq network count here. NIM value changes with the market; this is not a dollar balance or an investment return.</p>
        {goal && (
          <div className="mt-4">
            <div className="h-1 w-full bg-muted"><div className="h-1 bg-gold" style={{ width: `${Math.min(100, (realSum / goal) * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-muted-foreground">Goal: {goal.toLocaleString()} NIM</p>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-sm border p-4 text-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Reserve wallet</p>
        {wallets.data?.length ? wallets.data.map((wallet) => (
          <div key={wallet.id} className="mt-2">
            <p className="text-xs text-gold">Ownership verified · {wallet.network}</p>
            <p className="mt-1 break-all font-mono text-xs text-ivory">{wallet.address}</p>
          </div>
        )) : (
          <p className="mt-1 text-muted-foreground">Not verified. <Link to="/account" className="text-gold">Verify your NIM address</Link></p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Automatic Reserve transfers are not active.</p>
      </div>

      <h2 className="mt-8 font-display text-2xl text-ivory">Savings history</h2>
      {t.isLoading ? <div className="mt-3 h-20 animate-pulse bg-muted" /> : real.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No verified transfers yet.</p>
      ) : (
        <ul className="mt-3 divide-y border-y">{real.map((x) => <TxRow key={x.id} x={x} />)}</ul>
      )}

      {sim.length > 0 && (
        <div className="mt-8 rounded-sm border border-warning/50 p-4">
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-warning">Simulated development data — not real funds</p>
          <p className="mt-1 text-sm text-muted-foreground">{sum(sim).toLocaleString()} NIM across {sim.length} simulated transfers</p>
          <ul className="mt-2 divide-y">{sim.map((x) => <TxRow key={x.id} x={x} />)}</ul>
        </div>
      )}
    </AppShell>
  );
}

function TxRow({ x }: { x: { id: string; nim_amount: number; status: string; created_at: string; tx_hash: string | null } }) {
  return (
    <li className="flex justify-between py-3 text-sm">
      <span className="text-muted-foreground">{new Date(x.created_at).toLocaleDateString()} · {x.status}</span>
      <span className="text-ivory tabular-nums">+{Number(x.nim_amount).toLocaleString()} NIM</span>
    </li>
  );
}
