import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { WovenSeraph } from "@/components/Entity";
import { INTENTION_COPY, type Intention, type ManifestConfig } from "@/lib/manifest";

export const Route = createFileRoute("/_authenticated/vault/")({
  head: () => ({
    meta: [
      { title: "My Vault — NIMAURA" },
      { name: "description", content: "Your private collection of unsealed manifestations." },
      { property: "og:title", content: "My Vault — NIMAURA" },
      { property: "og:description", content: "Your private collection of unsealed manifestations." },
    ],
  }),
  component: Vault,
});

function Vault() {
  const q = useQuery({
    queryKey: ["vault"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manifestations")
        .select("id, intention, config, source, created_at, entities(name), daily_drops(number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <section className="mt-6">
        <p className="eyebrow">Private · Only you can see this</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">My Vault</h1>
      </section>
      {q.isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-3">{[0, 1].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded bg-muted" />)}</div>
      ) : q.error ? (
        <p className="mt-8 text-destructive">Your Vault could not be opened.</p>
      ) : !q.data?.length ? (
        <div className="mt-12 text-center">
          <p className="font-display text-2xl text-muted-foreground">Nothing has been unsealed yet.</p>
          <Link to="/unseal" className="mt-6 inline-block border-b border-gold pb-1 text-gold">Begin today's unsealing</Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3">
          {q.data.map((m) => (
            <li key={m.id}>
              <Link to="/vault/$id" params={{ id: m.id }} search={{ reveal: false }} className="block rounded-sm border bg-card p-2 transition hover:border-gold">
                <WovenSeraph config={m.config as unknown as ManifestConfig} className="aspect-[4/5] w-full" />
                <p className="mt-2 font-display text-base text-ivory">{m.entities?.name}</p>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {INTENTION_COPY[m.intention as Intention].label} · № {m.daily_drops?.number}
                  {m.source === "simulated" && <span className="text-warning"> · sim</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
