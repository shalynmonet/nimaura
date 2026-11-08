import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { profileQuery } from "@/lib/queries";
import { WalletPanel } from "@/components/WalletPanel";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { payoutAccess } from "@/lib/nimiq/payouts.functions";
import { TestnetPayoutQueue } from "@/components/TestnetPayoutQueue";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Account — NIMAURA" },
      { name: "description", content: "Wallet, credits, Reserve address and preferences." },
      { property: "og:title", content: "Account — NIMAURA" },
      { property: "og:description", content: "Wallet, credits, Reserve address and preferences." },
    ],
  }),
  component: Account,
});

function Account() {
  const accessFn = useServerFn(payoutAccess);
  const access = useQuery({ queryKey: ["payout-access"], queryFn: () => accessFn() });
  const profile = useQuery(profileQuery());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: async () => (await supabase.from("payment_attempts").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  useEffect(() => {
    if (profile.data) {
      setGoal(profile.data.savings_goal_nim ? String(profile.data.savings_goal_nim) : "");
    }
  }, [profile.data]);

  async function save() {
    if (!profile.data) return;
    if (goal && (!Number.isFinite(Number(goal)) || Number(goal) < 0)) { toast.error("Enter a nonnegative savings goal."); return; }
    const { error } = await supabase
      .from("profiles")
      .update({ savings_goal_nim: goal ? Number(goal) : null })
      .eq("id", profile.data.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const input = "w-full rounded-sm border border-input bg-card px-3 py-2 text-sm text-ivory outline-none focus:border-gold";
  return (
    <AppShell>
      <section className="mt-6">
        <p className="eyebrow">Collector</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">{profile.data?.display_name ?? "Account"}</h1>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-sm border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Complimentary</p>
          <p className="mt-1 font-display text-3xl text-ivory">{profile.data?.credits ?? "–"}</p>
        </div>
        <Link to="/vault" className="rounded-sm border bg-card p-4 hover:border-gold">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private Vault</p>
          <p className="mt-1 font-display text-xl text-gold">Open →</p>
        </Link>
      </div>

      <WalletPanel />
      {access.data === true && <TestnetPayoutQueue />}

      <div className="mt-4 space-y-3 rounded-sm border p-4">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Savings goal (NIM, optional)</span>
          <input className={`${input} mt-1`} type="number" min="0" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </label>
        <Button variant="outline" onClick={save} className="w-full rounded-sm border border-gold bg-gold/15 px-4 py-2 text-ivory">Save</Button>
      </div>

      <h2 className="mt-8 font-display text-2xl text-ivory">Transactions</h2>
      {payments.data?.length ? (
        <ul className="mt-3 divide-y border-y text-sm">
          {payments.data.map((p) => (
            <li key={p.id} className="flex justify-between py-3">
              <span className="text-muted-foreground">
                {new Date(p.created_at).toLocaleDateString()} · {p.status}
                {p.is_simulated && <span className="text-warning"> · simulated</span>}
              </span>
              <span className="text-ivory tabular-nums">{Number(p.nim_amount).toLocaleString()} NIM</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No payments yet.</p>
      )}

      <Button variant="outline" onClick={signOut} className="mt-10 w-full rounded-sm border px-4 py-3 text-sm text-muted-foreground hover:text-ivory">Sign out</Button>
    </AppShell>
  );
}
