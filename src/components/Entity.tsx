import { useId } from "react";
import type { ManifestConfig } from "@/lib/manifest";

/** The Woven Seraph — six houndstooth wings, watching eye, celestial rings. Rendered purely from config. */
export function WovenSeraph({ config, className }: { config: ManifestConfig; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gold = `oklch(0.76 0.11 ${80 + config.hueShift})`;
  const goldDim = `oklch(0.5 0.07 ${76 + config.hueShift})`;
  const ivory = "oklch(0.95 0.03 88)";
  const ink = "oklch(0.1 0.005 70)";
  const s = 8 * config.checkScale;
  const wingAngles = [-1, 0, 1].flatMap((i) => [i, i]).map((_, k) => {
    const pair = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    const right = (pair - 1) * config.wingSpread * 1.6 + config.wingDroop;
    const a = side === 1 ? right : 180 - right;
    return { a, side, pair };
  });

  return (
    <svg viewBox="0 0 400 500" className={className} role="img" aria-label="The Woven Seraph manifestation">
      <defs>
        <pattern id={`ht-${uid}`} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
          <rect width={s} height={s} fill={ivory} />
          <g fill={ink} transform={`scale(${s / 8})`}>
            <rect x="0" y="4" width="4" height="4" />
            <polygon points="0,4 4,0 4,2 2,4" />
            <polygon points="0,0 2,0 0,2" />
            <polygon points="4,4 6,4 4,6" />
            <polygon points="4,8 8,4 8,6 6,8" />
          </g>
        </pattern>
        <radialGradient id={`aura-${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={gold} stopOpacity="0.35" />
          <stop offset="60%" stopColor={gold} stopOpacity="0.04" />
          <stop offset="100%" stopColor={gold} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`iris-${uid}`}>
          <stop offset="0%" stopColor={ink} />
          <stop offset="35%" stopColor={ink} />
          <stop offset="40%" stopColor={gold} />
          <stop offset="85%" stopColor={goldDim} />
          <stop offset="100%" stopColor={ink} />
        </radialGradient>
      </defs>

      <rect width="400" height="500" fill={`url(#aura-${uid})`} />

      {config.stars.map((st, i) => (
        <circle
          key={i}
          cx={st.x}
          cy={st.y}
          r={st.r}
          fill={ivory}
          opacity={0.6}
          className={config.particleDir === "down" ? "animate-fall" : config.particleDir === "up" ? "animate-drift" : "animate-breathe"}
          style={{ animationDelay: `${st.d}s` }}
        />
      ))}

      {/* rings */}
      <g className={config.ringDirection === 1 ? "animate-spin-slow" : "animate-spin-rev"}>
        {Array.from({ length: config.rings }, (_, i) => {
          const r = 70 + i * 26;
          return (
            <g key={i}>
              <circle cx="200" cy="230" r={r} fill="none" stroke={gold} strokeOpacity={0.55 - i * 0.07} strokeWidth={i === 0 ? 1.2 : 0.6} strokeDasharray={i % 2 ? "2 6" : undefined} />
              {Array.from({ length: 6 + i * 2 }, (_, j) => {
                const t = (j / (6 + i * 2)) * Math.PI * 2;
                return <circle key={j} cx={200 + Math.cos(t) * r} cy={230 + Math.sin(t) * r} r={1.4} fill={gold} opacity={0.7} />;
              })}
            </g>
          );
        })}
      </g>
      {config.echo && (
        <g className="animate-spin-slow" opacity={0.35}>
          <polygon points="200,60 347,315 53,315" fill="none" stroke={gold} strokeWidth="0.6" />
          <polygon points="200,400 53,145 347,145" fill="none" stroke={gold} strokeWidth="0.6" />
        </g>
      )}

      {/* six woven wings */}
      <g className="animate-breathe">
        {wingAngles.map(({ a }, k) => (
          <g key={k} transform={`translate(200 230) rotate(${a}) scale(${config.wingScale})`}>
            <path d="M0 -6 C 50 -34, 120 -30, 168 0 C 120 30, 50 34, 0 6 Z" fill={`url(#ht-${uid})`} stroke={gold} strokeWidth="0.8" />
            <path d="M8 0 L 160 0" stroke={gold} strokeOpacity={0.5} strokeWidth="0.5" />
          </g>
        ))}
      </g>

      {/* the eye */}
      <g transform={`rotate(${config.eyeTilt} 200 230)`}>
        <circle cx="200" cy="230" r="54" fill={ink} stroke={gold} strokeWidth="1" />
        <g className="animate-blink">
          <path d="M150 230 Q200 190 250 230 Q200 270 150 230 Z" fill={ivory} />
          <circle cx="200" cy="230" r={17 * config.irisScale} fill={`url(#iris-${uid})`} />
          <circle cx="194" cy="224" r="3" fill={ivory} opacity="0.9" />
        </g>
        <path d="M150 230 Q200 190 250 230 Q200 270 150 230 Z" fill="none" stroke={gold} strokeWidth="1.2" />
      </g>

      {/* halo + sigil */}
      <ellipse cx="200" cy="120" rx="44" ry="8" fill="none" stroke={gold} strokeWidth="1" opacity="0.8" />
      <text x="200" y="470" textAnchor="middle" fill={gold} fontSize="10" letterSpacing="6" fontFamily="Jost, sans-serif" opacity="0.7">
        {config.intention.toUpperCase()}
      </text>
    </svg>
  );
}
