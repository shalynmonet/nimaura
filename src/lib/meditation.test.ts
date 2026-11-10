import { describe, expect, it } from "vitest";
import { meditationTimeline, stepAt, totalMs } from "./meditation";
describe("meditation timeline", () => {
  it("lasts about one minute for every path", () => {
    for (const p of ["become", "release", "receive", "remember"] as const) {
      const ms = totalMs(meditationTimeline(p));
      expect(ms).toBeGreaterThanOrEqual(55_000); expect(ms).toBeLessThanOrEqual(70_000);
    }
  });
  it("never tells the collector to close their eyes", () => {
    for (const p of ["become", "release", "receive", "remember"] as const)
      for (const s of meditationTimeline(p)) expect(s.text.toLowerCase()).not.toMatch(/close (the|your) eye/);
  });
  it("maps elapsed time to the shared step and completes", () => {
    const steps = meditationTimeline("release");
    expect(stepAt(steps, 0)).toBe(0);
    expect(stepAt(steps, 7000)).toBe(1);
    expect(stepAt(steps, totalMs(steps))).toBe(steps.length);
  });
});
