import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Study = lazy(() => import("@/components/SeraphStudyScene"));
export const Route = createFileRoute("/_authenticated/art-study")({
  ssr: false,
  head: () => ({ meta: [
    { title: "The Woven Seraph · Sculptural study — NIMAURA" },
    { name: "description", content: "A private, experimental living Seraph study. Existing collectibles remain unchanged." },
    { property: "og:title", content: "The Woven Seraph · Sculptural study — NIMAURA" },
    { property: "og:description", content: "An experimental woven sculpture and living encounter." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: ArtStudy,
});

function ArtStudy() {
  return <main className="min-h-screen bg-void text-foreground">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
      <Button asChild variant="ghost" size="sm"><Link to="/vault"><ArrowLeft /> Vault</Link></Button>
      <span className="text-xs uppercase text-muted-foreground">NIMAURA · Study 03</span>
      <Button asChild variant="ghost" size="sm"><Link to="/entity-study">Entity studies</Link></Button>
    </header>
    <div className="text-center">
      <p className="eyebrow">Remember · Fixed sample</p>
      <h1 className="mt-2 font-display text-4xl text-ivory">The Woven Seraph</h1>
    </div>
    <ClientOnly fallback={<div className="seraph-study-stage" />}>
      <Suspense fallback={<div className="seraph-study-stage flex items-center justify-center text-muted-foreground">Gathering the weave…</div>}><Study /></Suspense>
    </ClientOnly>
    <section className="mx-auto max-w-lg px-6 pb-16 text-center">
      <p className="text-sm text-gold">Touch and hold to slow its rhythm.</p>
      <p className="mt-2 text-xs text-muted-foreground">Tap to ripple. Drag a gold ring node to turn that ring; drag elsewhere to shift its gaze.</p>
      <p className="mt-8 font-display text-2xl italic leading-relaxed text-ivory">Return to what was always woven in.</p>
      <p className="mt-5 text-xs text-muted-foreground">Experimental study · seed 408325749 · not a collectible</p>
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">Houndstooth geometry adapted from Kevin L. Durette’s “Houndstooth SVG”, CC BY 4.0. <a className="underline underline-offset-4" href="https://commons.wikimedia.org/wiki/File:Houndstooth_SVG.svg" target="_blank" rel="noreferrer">Source & attribution</a></p>
    </section>
  </main>;
}