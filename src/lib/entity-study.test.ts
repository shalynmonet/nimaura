import { describe, expect, it } from "vitest";
import { buildEntityStudy, ENTITY_LINEUP, STUDY_PATHS, STUDY_SEEDS, studyWriting } from "./entity-study";
import { buildManifestation, CURRENT_RENDERER_VERSION, savedRendererVersion } from "./manifest";

describe("finite isolated entity collection", () => {
  it("contains exactly seven distinct identities including the existing Seraph", () => {
    expect(ENTITY_LINEUP).toHaveLength(7);
    expect(new Set(ENTITY_LINEUP.map(e => e.id)).size).toBe(7);
    expect(ENTITY_LINEUP[0].id).toBe("seraph");
  });
  it.each(["seraph", "orbital", "veiled"] as const)("replays %s for every fixed seed and four paths", identity => {
    expect(STUDY_PATHS).toEqual(["become", "release", "receive", "remember"]);
    for (const seed of STUDY_SEEDS) for (const path of STUDY_PATHS) {
      const a = buildEntityStudy(identity, seed, path);
      expect(buildEntityStudy(identity, seed, path)).toEqual(a);
      expect(buildEntityStudy(identity, seed + 1, path).parts).not.toEqual(a.parts);
      expect(buildEntityStudy(identity, seed + 1, path).aspect).not.toBe(a.aspect);
      expect(studyWriting(buildEntityStudy(identity, seed, path))).toEqual(studyWriting(a));
    }
  });
  it("retains the existing production renderer and legacy snapshot selection", () => {
    expect(CURRENT_RENDERER_VERSION).toBe(2);
    expect(savedRendererVersion({})).toBe(1);
    expect(buildManifestation(408325749, "receive", 1).v).toBe(1);
  });
});