import { describe, it, expect } from "vitest";
import { buildSeraphStudy, initialPlayback, advanceStudy } from "./seraph-study";
import { buildManifestation, savedRendererVersion, CURRENT_RENDERER_VERSION } from "./manifest";

describe("isolated sculptural study", () => {
  it("replays fixed renderer 3 base data with six wings", () => {
    const a = buildSeraphStudy(408325749, "remember");
    expect(a.rendererVersion).toBe(3);
    expect(a.wings).toHaveLength(6);
    expect(buildSeraphStudy(a.seed, a.intention)).toEqual(a);
    expect(buildSeraphStudy(a.seed + 1, a.intention).wings).not.toEqual(a.wings);
  });
  it("does not adopt the prototype or alter legacy snapshot selection", () => {
    expect(CURRENT_RENDERER_VERSION).toBe(2);
    expect(savedRendererVersion({})).toBe(1);
    expect(buildManifestation(408325749, "receive", 1).v).toBe(1);
  });
  it("hold slows continuously and release restores without changing base traits", () => {
    const config = buildSeraphStudy(731, "remember");
    const saved = JSON.stringify(config);
    const s = initialPlayback();
    for (let i = 0; i < 80; i++) advanceStudy(s, .05, { held: true, x: 0, y: 0, reduced: false });
    expect(s.speed).toBeCloseTo(.16, 3);
    for (let i = 0; i < 80; i++) advanceStudy(s, .05, { held: false, x: 0, y: 0, reduced: false });
    expect(s.speed).toBeCloseTo(1, 3);
    expect(JSON.stringify(config)).toBe(saved);
  });
  it("bounds gaze, damps tap ripple and calms reduced motion", () => {
    const s = initialPlayback(); s.ripple = 1;
    for (let i = 0; i < 100; i++) advanceStudy(s, .05, { held: false, x: 20, y: -20, reduced: true });
    expect(s.x).toBeLessThanOrEqual(1);
    expect(s.y).toBeGreaterThanOrEqual(-1);
    expect(s.ripple).toBe(0);
    expect(s.speed).toBeCloseTo(.12, 3);
  });
});
describe("tap tempo", () => {
  it("caps boost at 5x and a hold resets it", async () => {
    const { initialPlayback, advanceStudy } = await import("./seraph-study");
    const s = initialPlayback(); s.boost = 5;
    for (let i = 0; i < 200; i++) advanceStudy(s, .05, { held: false, x: 0, y: 0, reduced: false });
    expect(s.speed).toBeCloseTo(5, 2);
    for (let i = 0; i < 200; i++) advanceStudy(s, .05, { held: true, x: 0, y: 0, reduced: false });
    expect(s.boost).toBe(1); expect(s.speed).toBeCloseTo(.16, 2);
  });
});
