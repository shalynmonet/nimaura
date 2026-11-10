import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { collectiveProgress, collectiveQuery } from "@/lib/collective";

/** Evolving sealed ring: gold arc fills as the community approaches the next milestone. */
export function CollectiveRing({ fraction, className = "" }: { fraction: number; className?: string }) {
  const r = 44, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g className="origin-center animate-[spin_90s_linear_infinite]" style={{ transformBox: "fill-box" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1="3" x2="50" y2="8" stroke="var(--gold)" strokeOpacity="0.5" strokeWidth="0.6" transform={`rotate(${i * 30} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="1" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round"
        strokeDasharray={`${c * fraction} ${c}`} transform="rotate(-90 50 50)" />
      <polygon points="50,22 74,64 26,64" fill="none" stroke="var(--gold)" strokeOpacity="0.55" strokeWidth="0.7" />
      <polygon points="50,78 26,36 74,36" fill="none" stroke="var(--ivory)" strokeOpacity="0.3" strokeWidth="0.7" />
      <circle cx="50" cy="50" r="5" fill="var(--gold)" fillOpacity="0.25" className="animate-pulse" />
    </svg>
  );
}

export function CollectivePreview() {
  const q = useQuery(collectiveQuery());
  if (!q.data) return null;
  const p = collectiveProgress(q.data);
  return (
    <Link to="/collective" className="mt-14 block rounded-sm border border-border/60 p-6 text-center transition hover:border-gold/60">
      <p className="eyebrow">The Collective Seal</p>
      <CollectiveRing fraction={p.fraction} className="mx-auto mt-4 w-28" />
      <p className="mt-4 font-display text-2xl text-ivory tabular-nums">
        {q.data.total.toLocaleString()}{p.next && <span className="text-muted-foreground"> / {p.next.threshold.toLocaleString()}</span>}
      </p>
      <p className="mt-2 text-xs italic text-muted-foreground">One mystery. Thousands of intentions.</p>
    </Link>
  );
}
