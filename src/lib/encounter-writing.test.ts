import { describe, it, expect } from "vitest";
import { buildManifestation, INTENTIONS } from "./manifest";
import { encounterWriting, savedContentVersion, WOVEN_DAILY_LORE_V2 } from "./encounter-writing";

describe("saved encounter content rules", () => {
  it("keeps all unmarked original collectibles on original writing, including renderer 2", () => {
    for (const snapshot of [null, {}, { v: 1 }, { v: 2 }, { v: 2, contentVersion: 1 }]) {
      expect(savedContentVersion(snapshot)).toBe(1);
      expect(encounterWriting(731, "receive", snapshot, "The Woven Seraph")).toBeNull();
    }
    expect(() => savedContentVersion({ contentVersion: 99 })).toThrow("Unsupported");
  });
  it("marks future snapshots explicitly and preserves marker through JSON replay", () => {
    const config = buildManifestation(731, "receive");
    expect(savedContentVersion(config)).toBe(2);
    expect(encounterWriting(731, "receive", JSON.parse(JSON.stringify(config)), "The Woven Seraph")).toEqual(encounterWriting(731, "receive", config, "The Woven Seraph"));
  });
  it("writes eight distinct 60–100-word encounters with shared lore and distinct same-path questions", () => {
    const passages = new Set<string>();
    for (const intention of INTENTIONS) {
      const samples = [731, 9284].map(seed => encounterWriting(seed, intention, buildManifestation(seed, intention), "The Woven Seraph"));
      for (const sample of samples) {
        if (!sample) throw new Error("Expected authored encounter");
        const words = sample.passage.split(/\s+/).length;
        expect(words).toBeGreaterThanOrEqual(60); expect(words).toBeLessThanOrEqual(100);
        expect(sample.dailyLore).toBe(WOVEN_DAILY_LORE_V2);
        passages.add(sample.passage);
      }
      expect(samples[0]?.question).not.toBe(samples[1]?.question);
    }
    expect(passages.size).toBe(8);
  });
  it("does not invent Seraph features or lore for another daily entity", () => {
    expect(encounterWriting(731, "receive", buildManifestation(731, "receive"), "Another Entity")).toBeNull();
    expect(encounterWriting(731, "receive", { v: 1, contentVersion: 2 }, "The Woven Seraph")).toBeNull();
  });
});