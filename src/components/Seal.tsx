/** The sealed artifact. Reveals nothing of the entity — only a sigil. */
export function Seal({ sigil, fracturing = false, className }: { sigil: string; fracturing?: boolean; className?: string }) {
  const shards = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { a, dx: Math.cos(a) * 220, dy: Math.sin(a) * 220, rot: (i % 2 ? 1 : -1) * (40 + i * 9) };
  });
  return (
    <svg viewBox="0 0 300 300" className={className} aria-label="Sealed artifact">
      <defs>
        <radialGradient id="seal-g" cx="40%" cy="35%">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.5" />
          <stop offset="70%" stopColor="var(--gold-dim)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--void)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="150" cy="150" r="140" fill="url(#seal-g)" />
      <g className={fracturing ? "" : "animate-spin-slow"}>
        <circle cx="150" cy="150" r="128" fill="none" stroke="var(--gold)" strokeOpacity=".4" strokeDasharray="1 5" />
        <circle cx="150" cy="150" r="116" fill="none" stroke="var(--gold)" strokeOpacity=".6" />
        {Array.from({ length: 24 }, (_, i) => {
          const t = (i / 24) * Math.PI * 2;
          return <line key={i} x1={150 + Math.cos(t) * 116} y1={150 + Math.sin(t) * 116} x2={150 + Math.cos(t) * 108} y2={150 + Math.sin(t) * 108} stroke="var(--gold)" strokeOpacity=".7" />;
        })}
      </g>
      {shards.map((s, i) => {
        const a2 = s.a + (Math.PI * 2) / 10;
        return (
          <polygon
            key={i}
            points={`150,150 ${150 + Math.cos(s.a) * 100},${150 + Math.sin(s.a) * 100} ${150 + Math.cos(a2) * 100},${150 + Math.sin(a2) * 100}`}
            fill="var(--card)"
            stroke="var(--gold)"
            strokeOpacity=".35"
            className={fracturing ? "animate-shard" : ""}
            style={{ ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, ["--rot" as string]: `${s.rot}deg`, animationDelay: `${i * 40}ms` }}
          />
        );
      })}
      <g className={fracturing ? "animate-shard" : "animate-breathe"} style={{ ["--dx" as string]: "0px", ["--dy" as string]: "-30px", ["--rot" as string]: "0deg" }}>
        <circle cx="150" cy="150" r="34" fill="var(--void)" stroke="var(--gold)" />
        <text x="150" y="162" textAnchor="middle" fontSize="34" fill="var(--gold)">{sigil}</text>
      </g>
    </svg>
  );
}
