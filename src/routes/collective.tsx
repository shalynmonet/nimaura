import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CollectiveRing } from "@/components/CollectiveSeal";
import { collectiveProgress, collectiveQuery } from "@/lib/collective";

export const Route = createFileRoute("/collective")({
  head: () => ({
    meta: [
      { title: "The Collective Seal — NIMAURA" },
      { name: "description", content: "Every completed unsealing joins one shared mystery. Watch collective entities awaken at community milestones." },
      { property: "og:title", content: "The Collective Seal — NIMAURA" },
      { property: "og:description", content: "One mystery. Thousands of intentions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Collective,
});

function Collective() {
  const q = useQuery(collectiveQuery());
  const [open, setOpen] = useState<number | null>(null);
  if (q.isLoading) return <AppShell><div className="mx-auto mt-16 h-56 w-56 animate-pulse rounded-full bg-muted" /></AppShell>;
  if (!q.data) return <AppShell><p className="mt-16 text-center text-muted-foreground">The Collective Seal could not be reached.</p></AppShell>;
  const s = q.data, p = collectiveProgress(s);
  const awakened = s.milestones.filter((m) => m.unlocked_at);
  const detail = awakened.find((m) => m.ordinal === open);

  return (
    <AppShell>
      <section className="aura mt-6 text-center">
        <h1 className="eyebrow">The Collective Seal</h1>
        <p className="mt-3 font-display text-xl italic text-ivory">One mystery. Thousands of intentions.</p>
        <CollectiveRing fraction={p.fraction} className="mx-auto mt-8 w-60 max-w-full" />
        <p className="mt-6 font-display text-4xl text-ivory tabular-nums">{s.total.toLocaleString()}</p>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">completed unsealings</p>
        {p.next ? (
          <div className="mt-8 border-t border-border/60 pt-6">
            <p className="eyebrow">Next awakening · {p.next.threshold.toLocaleString()}</p>
            <p className="mt-3 font-display text-lg italic text-ivory">“{p.next.veiled_hint}”</p>
            <p className="mt-2 text-xs text-muted-foreground">{p.remaining.toLocaleString()} unsealings remain</p>
          </div>
        ) : <p className="mt-8 text-gold">Every seal has turned.</p>}
      </section>

      <section className="mt-12">
        <h2 className="eyebrow text-center">Milestones</h2>
        <ol className="mt-4 space-y-2">
          {s.milestones.map((m) => (
            <li key={m.ordinal}>
              <button
                disabled={!m.unlocked_at}
                onClick={() => setOpen(m.ordinal)}
                className="flex w-full items-center justify-between rounded-sm border border-border/60 px-4 py-3 text-left disabled:cursor-default enabled:hover:border-gold/60"
              >
                <span className="font-display text-ivory">{m.unlocked_at ? m.name : "Sealed"}</span>
                <span className={m.unlocked_at ? "text-xs text-gold" : "text-xs text-muted-foreground"}>
                  {m.unlocked_at ? `Awakened ${new Date(m.unlocked_at).toLocaleDateString()}` : m.threshold.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {awakened.length === 0 && <p className="mt-4 text-center text-xs text-muted-foreground">No collective entity has awakened yet.</p>}
      </section>

      {detail && (
        <section className="mt-10 rounded-sm border border-gold/40 p-6 text-center" aria-live="polite">
          <p className="eyebrow">{detail.designation}</p>
          <h2 className="mt-2 font-display text-2xl text-ivory">{detail.name}</h2>
          <p className="mt-4 text-sm text-muted-foreground">{detail.symbolism}</p>
          <p className="mt-4 font-display italic text-ivory">“{detail.reflection}”</p>
        </section>
      )}
    </AppShell>
  );
}
