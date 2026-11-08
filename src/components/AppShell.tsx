import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Arrival", glyph: "◈" },
  { to: "/vault", label: "Vault", glyph: "◇" },
  { to: "/reserve", label: "Reserve", glyph: "◎" },
  { to: "/account", label: "Account", glyph: "◯" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-dvh bg-void text-foreground">
      <header className="mx-auto flex max-w-md items-center justify-between px-6 pt-6">
        <Link to="/" className="font-display text-xl tracking-[0.4em] text-ivory">NIMAURA</Link>
        <span className="eyebrow text-[0.6rem] text-muted-foreground">Cycle III</span>
      </header>
      <main className="mx-auto max-w-md px-6 pb-28">{children}</main>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/90 backdrop-blur">
        <ul className="mx-auto flex max-w-md justify-around py-3">
          {NAV.map((n) => (
            <li key={n.to}>
              <Link
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="flex flex-col items-center gap-1 px-3 text-muted-foreground transition-colors data-[status=active]:text-gold"
              >
                <span aria-hidden className="text-lg leading-none">{n.glyph}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.25em]">{n.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function Countdown({ to }: { to: string }) {
  return <CountdownInner to={to} />;
}
function CountdownInner({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="tabular-nums">--:--:--</span>;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return <span className="tabular-nums">{p(h)}:{p(m)}:{p(s)}</span>;
}
