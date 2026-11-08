import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Countdown } from "@/components/AppShell";
import { Seal } from "@/components/Seal";
import { currentDropQuery, profileQuery } from "@/lib/queries";
import { buildManifestation, INTENTIONS, INTENTION_COPY, newSeed, type Intention } from "@/lib/manifest";
import { quoteUnseal, initiatePayment, type Quote } from "@/lib/nimiq";

export const Route = createFileRoute("/_authenticated/unseal")({
  head: () => ({
    meta: [
      { title: "Resonance — NIMAURA" },
      { name: "description", content: "Choose the intention that shapes how today's entity manifests." },
      { property: "og:title", content: "Resonance — NIMAURA" },
      { property: "og:description", content: "Choose the intention that shapes how today's entity manifests." },
    ],
  }),
  component: Resonance,
});

function Resonance() {
  const drop = useQuery(currentDropQuery());
  const profile = useQuery(profileQuery());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [intention, setIntention] = useState<Intention | null>(null);
  const [busy, setBusy] = useState(false);
  const [fracturing, setFracturing] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const credits = profile.data?.credits ?? 0;

  async function reveal(rpc: () => Promise<string>) {
    if (!intention || !drop.data) return;
    setBusy(true);
    try {
      const id = await rpc();
      setFracturing(true);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["vault"] });
      setTimeout(() => navigate({ to: "/vault/$id", params: { id }, search: { reveal: true } }), 1300);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  function unsealFree() {
    const seed = newSeed();
    const cfg = buildManifestation(seed, intention!);
    return reveal(async () => {
      const { data, error } = await supabase.rpc("unseal_with_credit", { _drop_id: drop.data!.id, _intention: intention!, _seed: seed, _config: cfg });
      if (error) throw error;
      return data as string;
    });
  }

  function unsealSimulated() {
    if (!quote) return;
    const seed = newSeed();
    const cfg = buildManifestation(seed, intention!);
    const idem = crypto.randomUUID();
    return reveal(async () => {
      const { data, error } = await supabase.rpc("simulate_paid_unseal", { _drop_id: drop.data!.id, _intention: intention!, _seed: seed, _config: cfg, _idem: idem, _rate: quote.rate });
      if (error) throw error;
      return data as string;
    });
  }

  async function loadQuote() {
    setQuoteErr(null);
    try {
      setQuote(await quoteUnseal(1));
    } catch (e) {
      setQuoteErr((e as Error).message);
    }
  }

  async function payReal() {
    if (!quote) return;
    const r = await initiatePayment(quote);
    toast.error(r.detail);
  }

  if (drop.isLoading || profile.isLoading) return <AppShell><div className="mt-20 h-64 animate-pulse rounded bg-muted" /></AppShell>;
  if (!drop.data) return <AppShell><p className="mt-20 text-center text-muted-foreground">No artifact is open right now.</p></AppShell>;

  return (
    <AppShell>
      <section className="mt-6 text-center">
        <p className="eyebrow">Resonance</p>
        <h1 className="mt-3 font-display text-3xl text-ivory">How will you meet it?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your choice shapes the manifestation. It reveals nothing of what waits.</p>
      </section>

      <div className="relative mx-auto mt-6 w-56">
        <Seal sigil={drop.data.sigil} fracturing={fracturing} className="w-56" />
        {fracturing && <div className="animate-flash pointer-events-none fixed inset-0 z-40 bg-ivory" />}
      </div>

      <div role="radiogroup" aria-label="Intention" className="mt-6 grid grid-cols-2 gap-3">
        {INTENTIONS.map((i) => {
          const c = INTENTION_COPY[i];
          const active = intention === i;
          return (
            <button
              key={i}
              role="radio"
              aria-checked={active}
              onClick={() => setIntention(i)}
              className={`rounded-sm border p-4 text-left transition ${active ? "glow-gold border-gold bg-gold/10" : "bg-card hover:border-gold/60"}`}
            >
              <span aria-hidden className="text-xl text-gold">{c.glyph}</span>
              <span className="mt-2 block font-display text-xl text-ivory">{c.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{c.line}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 space-y-3">
        {credits > 0 ? (
          <>
            <button
              disabled={!intention || busy}
              onClick={unsealFree}
              className="glow-gold w-full rounded-sm border border-gold bg-gold/15 px-6 py-4 font-display text-xl tracking-[0.2em] text-ivory disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Unsealing…" : "Unseal"}
            </button>
            <p className="text-center text-xs text-muted-foreground">Uses 1 of your {credits} complimentary {credits === 1 ? "credit" : "credits"}.</p>
          </>
        ) : (
          <div className="rounded-sm border bg-card p-5">
            <p className="eyebrow">Paid unsealing · $1 USD in NIM</p>
            {!quote ? (
              <>
                <button disabled={!intention} onClick={loadQuote} className="mt-4 w-full rounded-sm border border-gold px-4 py-3 text-ivory disabled:opacity-40">
                  Get live NIM quote
                </button>
                {quoteErr && <p className="mt-2 text-xs text-destructive">{quoteErr}</p>}
              </>
            ) : (
              <>
                <dl className="mt-4 space-y-2 text-sm">
                  <Row k="Rate" v={`1 NIM = $${quote.rate.toPrecision(3)}`} />
                  <Row k="You pay" v={`${quote.nim.toLocaleString()} NIM`} />
                  <Row k="To your Reserve (50%)" v={`${quote.savingsNim.toLocaleString()} NIM`} />
                  <Row k="To NIMAURA (50%)" v={`${quote.creatorNim.toLocaleString()} NIM`} />
                  <Row k="Network fee" v="Shown by Nimiq Pay" />
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">Reserve value is in NIM and will move with the market. It is not a dollar deposit.</p>
                <button onClick={payReal} disabled={busy} className="mt-4 w-full rounded-sm border border-gold bg-gold/15 px-4 py-3 text-ivory">
                  Pay with Nimiq Pay
                </button>
                <div className="mt-4 rounded-sm border border-warning/50 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.25em] text-warning">Development simulator</p>
                  <p className="mt-1 text-xs text-muted-foreground">No real NIM moves. Records are flagged simulated and never counted as real savings.</p>
                  <button onClick={unsealSimulated} disabled={busy} className="mt-3 w-full rounded-sm border border-warning/60 px-4 py-2 text-sm text-warning">
                    Simulate paid unsealing
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <p className="pt-2 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Closes in <Countdown to={drop.data.ends_at} />
        </p>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right text-ivory tabular-nums">{v}</dd>
    </div>
  );
}
