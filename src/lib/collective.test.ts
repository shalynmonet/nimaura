import { describe, expect, it } from "vitest";
import { collectiveProgress, type CollectiveMilestone } from "./collective";

const ms = (t: number[], unlocked = 0): CollectiveMilestone[] =>
  t.map((threshold, i) => ({ ordinal: i + 1, threshold, unlocked_at: i < unlocked ? "x" : null, veiled_hint: "", name: null, designation: null, symbolism: null, reflection: null }));
const T = [100, 250, 500, 1000, 2500, 5000, 10000];

describe("collective progress", () => {
  it("targets 100 first", () => {
    const p = collectiveProgress({ total: 2, milestones: ms(T) });
    expect(p.next?.threshold).toBe(100);
    expect(p.remaining).toBe(98);
  });
  it("at exactly 100 the next target is 250, cumulative", () => {
    const p = collectiveProgress({ total: 100, milestones: ms(T, 1) });
    expect(p.next?.threshold).toBe(250);
    expect(p.remaining).toBe(150);
    expect(p.fraction).toBe(0);
  });
  it("finishes after 10,000", () => {
    expect(collectiveProgress({ total: 10000, milestones: ms(T, 7) }).next).toBeNull();
  });
});
