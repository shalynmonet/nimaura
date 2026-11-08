// Pure, deterministic manifestation generator. Same (seed, intention) => same config.
export const INTENTIONS = ["become", "release", "receive", "remember"] as const;
export type Intention = (typeof INTENTIONS)[number];

export const INTENTION_COPY: Record<Intention, { label: string; line: string; glyph: string }> = {
  become: { label: "Become", line: "Ascend into a shape not yet worn.", glyph: "△" },
  release: { label: "Release", line: "Loosen what the pattern no longer needs.", glyph: "▽" },
  receive: { label: "Receive", line: "Stay open. Let it arrive.", glyph: "◯" },
  remember: { label: "Remember", line: "Return to what was always woven in.", glyph: "◇" },
};

export type ManifestConfig = {
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

export function buildManifestation(seed: number, intention: Intention): ManifestConfig {
  const r = mulberry32(seed);
  const base: ManifestConfig = {
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
