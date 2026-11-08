import { useId } from "react";
import type { SeraphConfig } from "@/lib/manifest";

/** Authentic tessellating broken-check silhouette, scaled from Kevin L. Durette's
 * Houndstooth SVG (CC BY 4.0), https://commons.wikimedia.org/wiki/File:Houndstooth_SVG.svg.
 * Corner fragments are continuations of neighboring teeth, not substitute motifs. */
export const HOUNDSTOOTH_TOOTH = "0,0 2,0 4,2 3,2 2,1 2,2 1,2 2,3 2,4 0,2";

export function SeraphV2({ config: c, className }: { config: SeraphConfig; className?: string }) {
  const id = `woven-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const gold = "var(--gold)";
  const ivory = "var(--ivory)";
  const ink = "var(--void)";
  const eye = c.eye;
  const w = eye.width / 2;
  const h = eye.height;
  const eyePath = eye.design === "diamond"
    ? `M${200-w} ${eye.y} L200 ${eye.y-h*.65} L${200+w} ${eye.y} L200 ${eye.y+h*.65} Z`
    : `M${200-w} ${eye.y} Q200 ${eye.y-h} ${200+w} ${eye.y} Q200 ${eye.y+h} ${200-w} ${eye.y} Z`;
  const wingOrder = c.intention === "remember" ? [0, 1, 4, 5, 2, 3] : [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 400 500" className={className} role="img" aria-label={`The Woven Seraph — ${c.intention} manifestation`} data-renderer-version="2">
      <defs>
        <pattern id={`${id}-weave`} width={c.weave.size} height={c.weave.size} patternUnits="userSpaceOnUse" patternTransform={`rotate(${c.weave.angle})`}>
          <rect width={c.weave.size} height={c.weave.size} fill="var(--weave-white)" />
          <g fill="var(--weave-black)" transform={`scale(${c.weave.size/4})`}>
            <polygon points={HOUNDSTOOTH_TOOTH} />
            <polygon points="4,0 4,1 3,0" />
            <polygon points="0,4 1,4 0,3" />
          </g>
        </pattern>
        <radialGradient id={`${id}-iris`}>
          <stop offset="0" stopColor={ink} />
          <stop offset=".35" stopColor={gold} />
          <stop offset="1" stopColor="var(--gold-dim)" />
        </radialGradient>
        {c.wings.map((wing, i) => <clipPath id={`${id}-wing-${i}`} key={i}><path d={wing.path} /></clipPath>)}
      </defs>

      <g opacity=".7">
        {c.stars.slice(0, 18).map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r} fill={ivory} className={c.particleDir === "down" ? "animate-fall" : "animate-drift"} style={{ animationDelay: `${star.d}s` }} />)}
      </g>
      <g transform={`rotate(${c.orbit.tilt} 200 ${eye.y})`} fill="none" stroke={gold}>
        {Array.from({ length: c.rings }, (_, i) => (
          <ellipse key={i} cx="200" cy={eye.y} rx={c.orbit.rx-i*11} ry={c.orbit.ry-i*13} strokeWidth={i === 0 ? 1.2 : .65} opacity={i === 0 ? .75 : .35} strokeDasharray={c.orbit.open ? "60 38" : i%2 ? "2 9" : undefined} />
        ))}
        {Array.from({ length: c.orbit.satellites }, (_, i) => {
          const a = i * Math.PI * 2 / c.orbit.satellites;
          return <circle key={i} cx={200+Math.cos(a)*c.orbit.rx} cy={eye.y+Math.sin(a)*c.orbit.ry} r={i%2 ? 3 : 5} fill={ink} strokeWidth="1" />;
        })}
      </g>
      <g className="animate-breathe">
        {wingOrder.map((i) => {
          const wing = c.wings[i];
          if (!wing) return null;
          return (
            <g key={i} transform={wing.transform} data-wing={i}>
              {c.echo && <path d={wing.path} transform="translate(-8 12)" fill="none" stroke={gold} strokeWidth=".8" opacity=".45" />}
              <g clipPath={`url(#${id}-wing-${i})`}>
                <path d={wing.path} fill={`url(#${id}-weave)`} />
                <path d={wing.vein} fill="none" stroke={gold} strokeWidth="1.2" />
                {c.intention === "remember" && <path d={wing.fold} fill="none" stroke={ink} strokeWidth="3" />}
              </g>
              <path d={wing.path} fill="none" stroke={gold} strokeWidth="1.2" />
            </g>
          );
        })}
      </g>
      <g transform={`rotate(${c.eyeTilt} 200 ${eye.y})`}>
        <circle cx="200" cy={eye.y} r={eye.radius+9} fill={ink} stroke={gold} strokeWidth="1.2" />
        {c.intention === "remember" && <circle cx="200" cy={eye.y} r={eye.radius+14} fill="none" stroke={gold} strokeWidth=".7" strokeDasharray="2 3" />}
        <g className="animate-blink">
          {eye.design === "round" ? <circle cx="200" cy={eye.y} r={eye.radius} fill={ivory} /> : <path d={eyePath} fill={ivory} />}
          <circle cx="200" cy={eye.y} r={eye.radius*.62} fill={`url(#${id}-iris)`} stroke={gold} strokeWidth="1" />
          {eye.pupil === "slit" ? <ellipse cx="200" cy={eye.y} rx="3.5" ry={eye.radius*.5} fill={ink} /> : <circle cx="200" cy={eye.y} r={eye.radius*.26} fill={ink} />}
          <circle cx="195" cy={eye.y-7} r="2.5" fill={ivory} />
        </g>
        {eye.design !== "round" && <path d={eyePath} fill="none" stroke={gold} strokeWidth="1.2" />}
      </g>
      {c.intention === "become" ? <path d="M186 78 L200 50 L214 78 M200 50 V103" fill="none" stroke={gold} strokeWidth="1" />
        : c.intention === "release" ? <path d="M166 96 L146 76 M234 96 L254 76" fill="none" stroke={gold} strokeWidth="1" />
        : <ellipse cx="200" cy={eye.y-c.orbit.ry-12} rx={c.intention === "receive" ? 53 : 30} ry="9" fill="none" stroke={gold} strokeWidth="1" />}
      <text x="200" y="470" textAnchor="middle" fill={gold} fontSize="10" letterSpacing="6" fontFamily="Jost, sans-serif" opacity=".7">{c.intention.toUpperCase()}</text>
    </svg>
  );
}