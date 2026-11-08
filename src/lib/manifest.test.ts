import { describe, it, expect } from "vitest";
import { buildManifestation } from "./manifest";

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
});
