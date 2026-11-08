import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildManifestation, savedRendererVersion, INTENTIONS } from "./manifest";

describe("manifestation reproducibility", () => {
  it("same seed and intention produce identical config", () => {
    expect(buildManifestation(424242, "receive")).toEqual(buildManifestation(424242, "receive"));
  });
  it("intention changes the manifestation", () => {
    const a = buildManifestation(7, "become");
    const b = buildManifestation(7, "release");
    expect(a.particleDir).toBe("up");
    expect(b.particleDir).toBe("down");
    expect(a.wingSpread).not.toBe(b.wingSpread);
  });
  it("remember adds an echo", () => {
    expect(buildManifestation(1, "remember").echo).toBe(true);
  });
  it("preserves frozen v1 config fingerprints for each intention", () => {
    const fingerprints = ["f09d85f719f158b65afb5a8f14a4937e0fc30b738e43a4fefd627ba9b2aae0a4", "fb764eaa591993ffe7c998eee2296e88bc9db4f39d9ae8347a5c5ea0f3e9f8a8", "47d20236d08a2cde7d52ae060bf5c5a997bb7f507cdf7d901f1f8f6459cbc621", "e323f45b609b635e36446d3811565ad5e14200845514f70287e15a60c67aa77b"];
    INTENTIONS.forEach((intention, i) => expect(createHash("sha256").update(JSON.stringify(buildManifestation(408325749, intention, 1))).digest("hex")).toBe(fingerprints[i]));
  });
  it("reads saved versions without trusting stored geometry and defaults missing versions to legacy", () => {
    expect(savedRendererVersion(null)).toBe(1);
    expect(savedRendererVersion({})).toBe(1);
    expect(savedRendererVersion({ v: 1 })).toBe(1);
    expect(savedRendererVersion({ v: 2, wings: "tampered" })).toBe(2);
    expect(() => savedRendererVersion({ v: 3 })).toThrow("Unsupported");
  });
  it("replays all eight new examples with exactly six deterministic, seed-dependent wings", () => {
    INTENTIONS.forEach((intention) => {
      for (const seed of [731, 9284]) {
        const a = buildManifestation(seed, intention);
        expect(a.v).toBe(2);
        const replayVersion = savedRendererVersion(JSON.parse(JSON.stringify(a)));
        expect(buildManifestation(seed, intention, replayVersion)).toEqual(a);
        if (a.v !== 2) throw new Error("Expected current renderer");
        expect(a.wings).toHaveLength(6);
        const b = buildManifestation(seed+1, intention);
        if (b.v !== 2) throw new Error("Expected current renderer");
        expect(a.wings).not.toEqual(b.wings);
        expect(a.eye).not.toEqual(b.eye);
        expect(a.orbit).not.toEqual(b.orbit);
        expect(a.weave).not.toEqual(b.weave);
      }
    });
  });
  it("gives intentions distinct geometry rather than merely rotating the same wings", () => {
    const paths = INTENTIONS.map(i => {
      const config = buildManifestation(731, i);
      if (config.v !== 2) throw new Error("Expected current renderer");
      return config.wings.map(w => w.path).join("|");
    });
    expect(new Set(paths).size).toBe(4);
  });
});

import { newManifestationSnapshot, savedSculptureVersion } from "./manifest";
describe("living sculpture versioning", () => {
  it("marks only new snapshots as living sculptures", () => {
    expect(savedSculptureVersion(newManifestationSnapshot(42, "receive"))).toBe(3);
    expect(savedSculptureVersion(buildManifestation(42, "receive"))).toBeNull();
    expect(savedSculptureVersion({ v: 2, contentVersion: 2 })).toBeNull();
  });
});
