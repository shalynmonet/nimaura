import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Countdown } from "@/components/AppShell";
import { Seal } from "@/components/Seal";
import { currentDropQuery, profileQuery } from "@/lib/queries";
import { buildManifestation, INTENTIONS, INTENTION_COPY, newSeed, type Intention } from "@/lib/manifest";
import { PaymentPanel } from "@/components/PaymentPanel";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/unseal")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  function completed(id: string) {
    setFracturing(true);
    void qc.invalidateQueries({ queryKey: ["profile"] });
    void qc.invalidateQueries({ queryKey: ["vault"] });
    setTimeout(() => navigate({ to: "/vault/$id", params: { id }, search: { reveal: true } }), 1300);
  }

  function unsealFree() {
    if (!intention || !drop.data) return;
    const selected = intention;
    const dropId = drop.data.id;
    const seed = newSeed();
    const cfg = buildManifestation(seed, selected);
    return reveal(async () => {
      const { data, error } = await supabase.rpc("unseal_with_credit", { _drop_id: dropId, _intention: selected, _seed: seed, _config: cfg });
      if (error) throw error;
      return data as string;
    });
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
            <Button variant="outline"
              key={i}
              role="radio"
              aria-checked={active}
              onClick={() => setIntention(i)}
              className={`rounded-sm border p-4 text-left transition ${active ? "glow-gold border-gold bg-gold/10" : "bg-card hover:border-gold/60"}`}
            >
              <span aria-hidden className="text-xl text-gold">{c.glyph}</span>
              <span className="mt-2 block font-display text-xl text-ivory">{c.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{c.line}</span>
            </Button>
          );
        })}
      </div>

      <div className="mt-8 space-y-3">
        {credits > 0 ? (
          <>
            <Button variant="outline"
              disabled={!intention || busy}
              onClick={unsealFree}
              className="glow-gold w-full rounded-sm border border-gold bg-gold/15 px-6 py-4 font-display text-xl tracking-[0.2em] text-ivory disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Unsealing…" : "Unseal"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Uses 1 of your {credits} complimentary {credits === 1 ? "credit" : "credits"}.</p>
          </>
        ) : (
          <PaymentPanel dropId={drop.data.id} intention={intention} onFulfilled={completed} />
        )}
        <p className="pt-2 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Closes in <Countdown to={drop.data.ends_at} />
        </p>
      </div>
    </AppShell>
  );
}

