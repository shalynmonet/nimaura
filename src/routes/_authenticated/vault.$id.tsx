import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
const LivingSculpture = lazy(() => import("@/components/SeraphStudyScene"));
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { WovenSeraph } from "@/components/Entity";
import { buildManifestation, savedRendererVersion, savedSculptureVersion, INTENTION_COPY, type Intention } from "@/lib/manifest";
import { startDrone, stopDrone } from "@/lib/sound";
import { encounterWriting } from "@/lib/encounter-writing";

export const Route = createFileRoute("/_authenticated/vault/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ reveal: s["reveal"] === true || s["reveal"] === "true" }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Encounter — NIMAURA" },
      { name: "description", content: "A private encounter with an unsealed entity." },
      { property: "og:title", content: "Encounter — NIMAURA" },
      { property: "og:description", content: "A private encounter with an unsealed entity." },
    ],
  }),
  component: Encounter,
});

function Encounter() {
  const { id } = Route.useParams();
  const { reveal } = Route.useSearch();
  const [phase, setPhase] = useState(reveal ? 0 : 3);
  const [sound, setSound] = useState(false);
  const [medStep, setMedStep] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["manifestation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manifestations")
        .select("id, intention, seed, config, source, created_at, entities(name, designation, symbolism, reflections, meditation), daily_drops(number)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!reveal) return;
    const t = [setTimeout(() => setPhase(1), 300), setTimeout(() => setPhase(2), 2000), setTimeout(() => setPhase(3), 4200)];
    return () => t.forEach(clearTimeout);
  }, [reveal]);

  useEffect(() => () => stopDrone(), []);

  useEffect(() => {
    if (medStep === null || !q.data) return;
    const steps = (q.data.entities?.meditation as string[]) ?? [];
    if (medStep >= steps.length) return;
    const t = setTimeout(() => setMedStep(medStep + 1), 7000);
    return () => clearTimeout(t);
  }, [medStep, q.data]);

  if (q.isLoading) return <AppShell><div className="mt-16 aspect-[4/5] animate-pulse rounded bg-muted" /></AppShell>;
  if (!q.data || q.error) return <AppShell><p className="mt-16 text-center text-muted-foreground">This manifestation is not in your Vault.</p></AppShell>;

  const m = q.data;
  const intention = m.intention as Intention;
  // Reproduce from saved parameters (seed + intention), the canonical source.
  const config = buildManifestation(Number(m.seed), intention, savedRendererVersion(m.config));
  const e = m.entities;
  if (!e) return <AppShell><p className="mt-16 text-muted-foreground">This entity could not be opened.</p></AppShell>;
  const reflection = (e.reflections as Record<string, string>)[intention];
  const meditation = (e.meditation as string[]) ?? [];
  const writing = encounterWriting(Number(m.seed), intention, m.config, e.name);

  function toggleSound() {
    if (sound) stopDrone();
    else startDrone(Number(m.seed));
    setSound(!sound);
  }

  return (
    <AppShell>
      <div className="relative mt-4">
        {phase < 3 && (
          <svg viewBox="0 0 400 500" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {phase >= 1 &&
              [0, 60, 120].map((r) => (
                <polygon key={r} points="200,90 330,315 70,315" transform={`rotate(${r} 200 230)`} fill="none" stroke="var(--gold)" strokeWidth="0.8" className="animate-draw" />
              ))}
            {phase >= 1 && <circle cx="200" cy="230" r="150" fill="none" stroke="var(--gold)" strokeWidth="0.6" className="animate-draw" />}
          </svg>
        )}
        <div className={phase >= 2 ? "animate-manifest" : "opacity-0"}>
          {savedSculptureVersion(m.config) ? (
            <Suspense fallback={<WovenSeraph config={config} className="w-full" />}>
              <LivingSculpture seed={Number(m.seed)} path={intention} />
              <p className="mt-2 text-center text-xs text-muted-foreground">Hold to slow · tap to ripple · drag to shift</p>
            </Suspense>
          ) : <WovenSeraph config={config} className="w-full" />}
        </div>
      </div>

      <section className={phase >= 3 ? "animate-rise" : "invisible"}>
        {m.source === "testnet" && <p className="eyebrow text-center text-warning">TESTNET collectible · not a mainnet purchase</p>}
        <p className="eyebrow text-center">{e.designation}</p>
        <h1 className="mt-2 text-center font-display text-4xl text-ivory">{e.name}</h1>
        <p className="mt-1 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {INTENTION_COPY[intention].label} · Artifact № {m.daily_drops?.number} · seed {m.seed}
        </p>

        <div className="mt-4 flex justify-center gap-2">
          <button onClick={toggleSound} aria-pressed={sound} className="rounded-sm border px-4 py-2 text-xs uppercase tracking-[0.2em] text-ivory hover:border-gold">
            {sound ? "Silence" : "Listen"}
          </button>
          <button onClick={() => setMedStep(medStep === null ? 0 : null)} className="rounded-sm border px-4 py-2 text-xs uppercase tracking-[0.2em] text-ivory hover:border-gold">
            {medStep === null ? "Meditate" : "End meditation"}
          </button>
        </div>

        {medStep !== null && (
          <div className="mt-6 flex flex-col items-center rounded-sm border bg-card p-6 text-center" aria-live="polite">
            <div className="animate-breathe h-16 w-16 rounded-full border border-gold" />
            <p className="mt-4 font-display text-xl italic text-ivory">
              {medStep < meditation.length ? meditation[medStep] : "The eye closes. It keeps watching for you."}
            </p>
          </div>
        )}

        {writing ? (
          <div className="mt-8 space-y-7">
            <div>
              <h2 className="eyebrow">Daily lore</h2>
              <p className="mt-3 font-display text-lg leading-relaxed text-foreground">{writing.dailyLore}</p>
            </div>
            <div>
              <h2 className="font-display text-2xl text-ivory">Your encounter</h2>
              <p className="mt-3 font-display text-xl leading-relaxed text-foreground">{writing.passage}</p>
            </div>
            <div className="border-l border-gold pl-4">
              <h2 className="eyebrow">Reflection</h2>
              <p className="mt-3 font-display text-xl italic leading-relaxed text-ivory">{writing.question}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-8 font-display text-lg leading-relaxed text-foreground">{e.symbolism}</p>
            <blockquote className="mt-6 border-l border-gold pl-4 font-display text-xl italic text-ivory">{reflection}</blockquote>
          </>
        )}

        <div className="mt-8 rounded-sm border p-4 text-sm">
          <p className="eyebrow">Entered your Vault</p>
          <p className="mt-2 text-muted-foreground">
            Unsealed {new Date(m.created_at).toLocaleString()} ·{" "}
            {m.source === "complimentary" ? "Complimentary credit" : m.source === "testnet" ? <span className="text-warning">TESTNET payment · Reserve allocation is not delivered savings</span> : m.source === "simulated" ? <span className="text-warning">Simulated payment (dev)</span> : "Paid"}
          </p>
        </div>
        <Link to="/vault" className="mt-6 block text-center text-sm text-gold">Return to Vault</Link>
      </section>
    </AppShell>
  );
}
