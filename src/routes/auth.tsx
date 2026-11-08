import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AppShell } from "@/components/AppShell";

type Search = { redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const r = s["redirect"];
    return { redirect: typeof r === "string" && r.startsWith("/") && !r.startsWith("//") ? r : undefined };
  },
  head: () => ({
    meta: [
      { title: "Enter NIMAURA — Collector sign in" },
      { name: "description", content: "Sign in to keep your private Vault and Reserve." },
      { property: "og:title", content: "Enter NIMAURA" },
      { property: "og:description", content: "Sign in to keep your private Vault and Reserve." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setSent(true);
        else navigate({ to: redirect ?? "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: redirect ?? "/" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (redirect) sessionStorage.setItem("nimaura_redirect", redirect);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) {
      toast.error(r.error.message ?? "Google sign-in failed");
      return;
    }
    if (r.redirected) return;
    navigate({ to: redirect ?? "/" });
  }

  const input = "w-full rounded-sm border border-input bg-card px-4 py-3 text-ivory outline-none focus:border-gold";
  return (
    <AppShell>
      <section className="mt-12 text-center">
        <p className="eyebrow">The threshold</p>
        <h1 className="mt-3 font-display text-4xl text-ivory">{mode === "in" ? "Return, collector" : "Become a collector"}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Your Vault is private. Only you will ever see what you unseal.</p>
      </section>
      {sent ? (
        <p className="mt-10 rounded-sm border p-6 text-center text-ivory">Check your email to confirm your account, then return here.</p>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-3">
          <button type="button" onClick={google} className="flex w-full items-center justify-center gap-3 rounded-sm border border-input bg-ivory px-4 py-3 text-sm font-medium text-void">
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
            Continue with Google
          </button>
          <div className="py-2 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">or</div>
          <input className={input} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input className={input} type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
          <button disabled={busy} className="w-full rounded-sm border border-gold bg-gold/15 px-4 py-3 font-display text-lg tracking-[0.15em] text-ivory disabled:opacity-50">
            {busy ? "…" : mode === "in" ? "Enter" : "Create collector"}
          </button>
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full pt-2 text-sm text-muted-foreground underline-offset-4 hover:underline">
            {mode === "in" ? "New here? Become a collector" : "Already a collector? Sign in"}
          </button>
        </form>
      )}
    </AppShell>
  );
}
