import { describe, expect, it } from "vitest";
import { sectorPolicyTargetMatches } from "./corporations";
import { updateCorporationSettingsSchema } from "@/lib/api/schemas/corporations";

describe("updateCorporationSettingsSchema", () => {
  it("accepts operating lanes and rejects unknown focus", () => {
    expect(updateCorporationSettingsSchema.safeParse({ primaryType: "unknown_type" }).success).toBe(
      false
    );
    expect(
      updateCorporationSettingsSchema.safeParse({ secondaryType: "unknown_type" }).success
    ).toBe(false);
    expect(updateCorporationSettingsSchema.safeParse({ secondaryType: null }).success).toBe(true);
    expect(updateCorporationSettingsSchema.safeParse({ primaryType: "media" }).success).toBe(true);
  });
});

describe("sectorPolicyTargetMatches", () => {
  it("matches a target to the same sector type only", () => {
    expect(sectorPolicyTargetMatches("manufacturing", "manufacturing")).toBe(true);
    expect(sectorPolicyTargetMatches("media", "media")).toBe(true);
    expect(sectorPolicyTargetMatches("media", "manufacturing")).toBe(false);
  });

  it("never matches an empty or unrelated target", () => {
    expect(sectorPolicyTargetMatches(undefined, "manufacturing")).toBe(false);
    expect(sectorPolicyTargetMatches("energy", "manufacturing")).toBe(false);
  });
});
