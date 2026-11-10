import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Countdown } from "@/components/AppShell";
import { Seal } from "@/components/Seal";
import { CollectivePreview } from "@/components/CollectiveSeal";
import { currentDropQuery, profileQuery, sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "NIMAURA — Today's sealed artifact" },
      { name: "description", content: "A new mysterious entity waits to be unsealed every 24 hours. Choose an intention. Save for the future." },
      { property: "og:title", content: "NIMAURA — Unseal the unseen" },
      { property: "og:description", content: "A daily generative-art unsealing ritual that saves for your future." },
    ],
  }),
  component: Arrival,
});

function Arrival() {
  const drop = useQuery(currentDropQuery());
  const session = useQuery(sessionQuery());
  const profile = useQuery({ ...profileQuery(), enabled: !!session.data });

  return (
    <AppShell>
      <section className="aura relative mt-6 flex flex-col items-center text-center">
        <p className="eyebrow animate-rise">Unseal the unseen · Save for the future</p>
        {drop.isLoading ? (
          <div className="mt-16 h-72 w-72 animate-pulse rounded-full bg-muted" />
        ) : drop.error ? (
          <p className="mt-16 text-destructive">The artifact could not be reached. Refresh to try again.</p>
        ) : !drop.data ? (
          <p className="mt-16 font-display text-2xl text-muted-foreground">No artifact is open right now.</p>
        ) : (
          <>
            <Seal sigil={drop.data.sigil} className="mt-8 w-72 max-w-full" />
            <p className="eyebrow mt-6">Artifact № {String(drop.data.number).padStart(3, "0")}</p>
            <h1 className="mt-4 font-display text-3xl italic leading-snug text-ivory">“{drop.data.clue}”</h1>
            <p className="mt-6 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Closes in <span className="text-gold"><Countdown to={drop.data.ends_at} /></span>
            </p>
            <Link
              to="/unseal"
              className="glow-gold mt-10 inline-flex w-full items-center justify-center rounded-sm border border-gold bg-gold/10 px-6 py-4 font-display text-xl tracking-[0.2em] text-ivory transition hover:bg-gold/20"
            >
              Begin the Unsealing
            </Link>
            <p className="mt-4 text-xs text-muted-foreground">
              {session.data
                ? profile.data
                  ? `${profile.data.credits} complimentary ${profile.data.credits === 1 ? "credit" : "credits"} remain`
                  : "…"
                : "New collectors receive two complimentary unsealings."}
            </p>
          </>
        )}
      </section>
      <CollectivePreview />
    </AppShell>
  );
}
