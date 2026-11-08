// Pure, deterministic manifestation generator. Same (seed, intention) => same config.
export const INTENTIONS = ["become", "release", "receive", "remember"] as const;
export type Intention = (typeof INTENTIONS)[number];

export const INTENTION_COPY: Record<Intention, { label: string; line: string; glyph: string }> = {
  become: { label: "Become", line: "Ascend into a shape not yet worn.", glyph: "△" },
  release: { label: "Release", line: "Loosen what the pattern no longer needs.", glyph: "▽" },
  receive: { label: "Receive", line: "Stay open. Let it arrive.", glyph: "◯" },
  remember: { label: "Remember", line: "Return to what was always woven in.", glyph: "◇" },
};

export type LegacyManifestConfig = {
  v: 1;
  intention: Intention;
  hueShift: number; // -12..12 degrees within gold family
  rings: number; // 3..6
  ringDirection: 1 | -1;
  wingSpread: number; // degrees
  wingDroop: number; // degrees
  wingScale: number;
  irisScale: number;
  eyeTilt: number;
  echo: boolean;
  particleDir: "up" | "down" | "in";
  stars: { x: number; y: number; r: number; d: number }[];
  checkScale: number;
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 1) % 2147483647;
}

// Frozen v1 generator: existing snapshots and unversioned records always use this branch.
export function buildLegacyManifestation(seed: number, intention: Intention): LegacyManifestConfig {
  const r = mulberry32(seed);
  const base: LegacyManifestConfig = {
    v: 1,
    intention,
    hueShift: Math.round((r() * 24 - 12) * 10) / 10,
    rings: 3 + Math.floor(r() * 4),
    ringDirection: r() > 0.5 ? 1 : -1,
    wingSpread: 22 + r() * 10,
    wingDroop: 0,
    wingScale: 0.9 + r() * 0.2,
    irisScale: 0.85 + r() * 0.25,
    eyeTilt: Math.round((r() * 10 - 5) * 10) / 10,
    echo: false,
    particleDir: "up",
    checkScale: 0.8 + r() * 0.5,
    stars: Array.from({ length: 28 }, () => ({
      x: Math.round(r() * 400),
      y: Math.round(r() * 500),
      r: Math.round((0.4 + r() * 1.4) * 10) / 10,
      d: Math.round(r() * 70) / 10,
    })),
  };
  switch (intention) {
    case "become":
      return { ...base, wingSpread: base.wingSpread + 12, wingDroop: -10, particleDir: "up" };
    case "release":
      return { ...base, wingSpread: base.wingSpread - 4, wingDroop: 16, particleDir: "down", rings: Math.max(3, base.rings - 1) };
    case "receive":
      return { ...base, irisScale: base.irisScale * 1.25, particleDir: "in" };
    case "remember":
      return { ...base, echo: true, ringDirection: (base.ringDirection * -1) as 1 | -1 };
  }
}

export type WingGeometry = { path: string; vein: string; transform: string; fold: string };
export type SeraphConfig = Omit<LegacyManifestConfig, "v"> & {
  v: 2;
  contentVersion?: 2;
  wings: WingGeometry[];
  eye: { y: number; width: number; height: number; design: "almond" | "diamond" | "round"; pupil: "round" | "slit"; radius: number };
  orbit: { rx: number; ry: number; tilt: number; open: boolean; satellites: number };
  weave: { size: number; angle: number };
};
export type ManifestConfig = LegacyManifestConfig | SeraphConfig;
export type RendererVersion = 1 | 2;
export const CURRENT_RENDERER_VERSION: RendererVersion = 2;

/** Snapshot supplies only renderer version; geometry is regenerated from saved seed/intention. */
export function savedRendererVersion(snapshot: unknown): RendererVersion {
  if (!snapshot || typeof snapshot !== "object" || !("v" in snapshot)) return 1;
  const version = snapshot.v;
  if (version === 1 || version === 2) return version;
  throw new Error("Unsupported manifestation renderer version");
}

export function buildManifestation(seed: number, intention: Intention, version: RendererVersion = CURRENT_RENDERER_VERSION): ManifestConfig {
  const legacy = buildLegacyManifestation(seed, intention);
  if (version === 1) return legacy;
  const r = mulberry32((seed ^ 0x53e2a719) >>> 0);
  const n = (min: number, max: number) => min + r() * (max - min);
  const rounded = (value: number) => Math.round(value * 100) / 100;
  const y = rounded(intention === "become" ? n(267, 290) : intention === "release" ? n(218, 244) : intention === "receive" ? n(235, 258) : n(233, 265));
  const variant = r() > .5;
  const wings: WingGeometry[] = [];
  for (let pair = 0; pair < 3; pair++) {
    const length = rounded(intention === "become" ? n(145, 184) - pair * 12 : intention === "remember" ? 160 - pair * n(25, 34) : n(112, 151));
    const width = rounded(intention === "receive" ? n(45, 68) : intention === "remember" ? n(32, 47) : intention === "release" ? n(16, 30) : n(19, 35));
    const bend = rounded(n(-12, 20));
    const angle = rounded(intention === "become" ? (variant ? [-74, -42, -8][pair] : [-82, -60, -28][pair]) ?? 0 : intention === "release" ? [-52, -3, 50][pair] ?? 0 : intention === "receive" ? (variant ? [-65, -8, 50][pair] : [-78, 0, 72][pair]) ?? 0 : (variant ? [-18, 9, 36][pair] : [-58, -36, -14][pair]) ?? 0);
    const x = intention === "release" ? n(48, 64) : intention === "receive" ? n(24, 36) : intention === "remember" ? n(3, 10) : n(9, 20);
    const dy = intention === "become" ? pair * 17 - 24 : intention === "remember" ? pair * 9 - 14 : (pair - 1) * 16;
    let path: string;
    if (intention === "become") {
      path = `M0 0 C${length*.25} ${-width},${length*.7} ${-width*1.4},${length} ${bend-width*.6} L${length*.7} ${bend+width*.32} Q${length*.36} ${width},0 9 Z`;
    } else if (intention === "release") {
      path = variant
        ? `M0 0 Q${length*.44} ${-width*1.8},${length} ${-width} L${length*.8} 0 L${length*.94} ${width*.6} Q${length*.36} ${width},0 8 Z`
        : `M0 0 L${length*.38} ${-width} L${length} ${bend-width*.7} L${length*.64} ${width*.7} L${length*.29} ${width*.3} Z`;
    } else if (intention === "receive") {
      path = `M0 0 C${length*.2} ${-width*1.65},${length*.9} ${-width*1.3},${length} ${width*.45} Q${length*.73} ${-width*.3},${length*.52} ${width*.55} Q${length*.2} ${width},0 10 Z`;
    } else {
      path = variant
        ? `M0 0 L${length*.42} ${-width} L${length} ${-width*.4} L${length*.69} ${width} L${length*.38} ${width*.3} L${length*.18} ${width*.8} Z`
        : `M0 0 L${length*.25} ${-width*1.25} L${length*.83} ${-width} L${length} ${width*.5} L${length*.51} ${width*.8} L${length*.32} ${-width*.25} Z`;
    }
    for (const side of [-1, 1]) {
      wings.push({ path, vein: `M8 4 Q${length*.45} ${bend},${length*.88} ${-width*.2}`, fold: `M${length*.38} ${-width*.8} L${length*.53} 5 L${length*.69} ${width*.7}`, transform: `translate(${rounded(200+side*x)} ${rounded(y+dy)}) scale(${side} 1) rotate(${rounded(angle+n(-8,8))})` });
    }
  }
  return {
    ...legacy, v: 2, contentVersion: 2, wings,
    eye: { y, width: rounded(n(68, 95)), height: rounded(n(26, 43)), design: intention === "remember" ? "diamond" : variant ? "almond" : "round", pupil: r() > .5 ? "slit" : "round", radius: rounded(n(25, 35)) },
    orbit: { rx: rounded(n(111, 157)), ry: rounded(intention === "become" ? n(147, 175) : intention === "remember" ? n(80, 112) : n(98, 140)), tilt: rounded(n(-28, 28)), open: intention === "release", satellites: 3 + Math.floor(n(0, 5)) },
    weave: { size: rounded(n(15, 22)), angle: variant ? 0 : 22.5 },
  };
}
