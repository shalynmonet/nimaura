import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildEntityStudy, ENTITY_LINEUP, STUDY_CLUES, STUDY_PATHS, STUDY_SEEDS, studyDirection, studyWriting, type StudyIdentity } from "@/lib/entity-study";
import type { Intention } from "@/lib/manifest";

const Scene = lazy(() => import("@/components/SeraphStudyScene"));
export const Route = createFileRoute("/_authenticated/entity-study")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Three presences · Entity studies — NIMAURA" },
    { name: "description", content: "Private motion studies of the Woven Seraph, Parallax Choir and Foldkeeper across four paths." },
    { property: "og:title", content: "Three presences · Entity studies — NIMAURA" },
    { property: "og:description", content: "Three distinct woven presences from a proposed finite collection of seven." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: EntityStudy,
});

function EntityStudy() {
  const [identity, setIdentity] = useState<StudyIdentity>("orbital");
  const [path, setPath] = useState<Intention>("become");
  const [seedIndex, setSeedIndex] = useState(0);
  const seed = STUDY_SEEDS[seedIndex] ?? STUDY_SEEDS[0];
  const entity = ENTITY_LINEUP.find(e => e.id === identity) ?? ENTITY_LINEUP[0];
  const config = useMemo(() => buildEntityStudy(identity, seed, path), [identity, seed, path]);
  const writing = studyWriting(config), direction = studyDirection(identity, path);
  return <main className="min-h-screen bg-void text-foreground">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
      <Button asChild variant="ghost" size="sm"><Link to="/art-study"><ArrowLeft /> Studies</Link></Button>
      <span className="text-xs text-muted-foreground">NIMAURA · Collection study</span>
    </header>
    <nav aria-label="Study entity" className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 px-3">
      {ENTITY_LINEUP.slice(0, 3).map(e => <Button key={e.id} size="sm" variant={identity === e.id ? "secondary" : "ghost"} aria-pressed={identity === e.id} onClick={() => setIdentity(e.id as StudyIdentity)}>{e.name.replace("The ", "")}</Button>)}
    </nav>
    <div className="mt-5 px-5 text-center">
      <p className="text-xs uppercase text-gold">{entity.epithet}</p>
      <h1 className="mt-1 font-display text-4xl text-ivory">{entity.name}</h1>
      <div className="mt-4 flex flex-wrap justify-center gap-1" role="group" aria-label="Chosen path">
        {STUDY_PATHS.map(p => <Button key={p} size="sm" variant={p === path ? "secondary" : "ghost"} aria-pressed={path === p} onClick={() => setPath(p)} className="capitalize">{p}</Button>)}
      </div>
    </div>
    <ClientOnly fallback={<div className="seraph-study-stage" />}><Suspense fallback={<div className="seraph-study-stage flex items-center justify-center text-muted-foreground">Gathering the weave…</div>}>
      <Scene key={`${identity}-${path}-${seed}`} identity={identity} path={path} seed={seed} />
    </Suspense></ClientOnly>
    <div className="mx-auto flex max-w-lg items-center justify-center gap-4 px-5 py-2">
      <span className="text-xs text-muted-foreground">Sample {seedIndex + 1} · {seed}</span>
      <Button variant="ghost" size="icon" aria-label="Switch fixed sample seed" title="Switch fixed sample seed" onClick={() => setSeedIndex(i => (i + 1) % STUDY_SEEDS.length)}><ArrowRight /></Button>
    </div>
    <section className="mx-auto max-w-2xl px-6 pb-12">
      <p className="text-center text-sm italic text-gold">{entity.meaning}</p>
      <p className="mt-6 font-display text-xl leading-relaxed text-ivory">{entity.lore}</p>
      <h2 className="mt-8 text-2xl">Your encounter</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{writing.passage}</p>
      <p className="mt-5 font-display text-2xl italic text-ivory">{writing.question}</p>
      <dl className="mt-8 grid grid-cols-1 gap-4 border-y border-border py-6 text-sm sm:grid-cols-2">
        {[["Structure", entity.structure], ["Materials", entity.material], ["Movement", entity.motion], ["Chosen path", `${direction[0]} · ${direction[1]}`]].map(([label, value]) => <div key={label}><dt className="text-gold">{label}</dt><dd className="mt-1 leading-relaxed text-muted-foreground">{value}</dd></div>)}
      </dl>
      <h2 className="mt-8 text-2xl">Sealed fragments</h2>
      <div className="mt-4 space-y-4">{STUDY_CLUES[identity].map((clue, i) => <div key={clue} className="flex items-center gap-4">
        <svg width="32" height="32" viewBox="0 0 32 32" className="shrink-0 text-gold" aria-label={`Abstract sealed sigil ${i + 1}`}><g fill="none" stroke="currentColor" strokeWidth="1"><circle cx="16" cy="16" r={7 + i * 3} strokeDasharray={`${9 + i * 3} 5`} /><path d={i === 0 ? "M16 2v9m0 10v9M2 16h9m10 0h9" : i === 1 ? "M7 5l18 22M25 5L7 27" : "M4 20l12-13 12 13M9 25h14"} /></g></svg>
        <p className="text-sm italic text-muted-foreground">{clue}</p>
      </div>)}</div>
    </section>
    <section className="border-t border-border px-6 py-10">
      <div className="mx-auto max-w-4xl"><h2 className="font-display text-3xl">Seven identities · 120 daily drops</h2>
        <ol className="mt-6 divide-y divide-border">{ENTITY_LINEUP.map((e, i) => <li key={e.id} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]"><div><h3 className="text-xl text-ivory">{e.name}</h3><p className="mt-1 text-xs text-gold">{i < 3 ? "Motion study" : "Proposed identity"}</p></div><p className="text-sm leading-relaxed text-muted-foreground">{e.structure}. {e.motion}.</p></li>)}</ol>
      </div>
    </section>
  </main>;
}