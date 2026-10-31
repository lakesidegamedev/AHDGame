import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";

const techTreesEnabled = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/corporations/techTree/featureFlag", () => ({
  isSectorTechTreesEnabled: vi.fn(async () => techTreesEnabled.value),
}));
vi.mock("@/lib/constants/techTree", () => ({
  getSectorTechEffects: vi.fn(() => ({
    expansionDiscount: 0.15,
    growthCostMultiplier: 0.9,
    dominanceShield: 0.2,
  })),
}));
vi.mock("@/lib/corporations/strengthUpkeep", () => ({
  loadStrengthUpkeepStage: vi.fn(async () => 0),
  upkeptDominanceShield: vi.fn(() => 0.1),
}));

import { getSectorTechEffects } from "@/lib/constants/techTree";
import { upkeptDominanceShield } from "@/lib/corporations/strengthUpkeep";
import { loadFoundingTechEffects } from "./foundingTechEffects";

const db = {} as Db;
const corporation = {
  type: "energy" as const,
  industryModel: null,
  mediaDiscriminator: null,
  unlockedTechNodeIds: ["n1"],
  techDecadeLane: {},
};

describe("loadFoundingTechEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    techTreesEnabled.value = true;
  });

  it("scopes tech to the lane being founded, not the corporation's primary type", async () => {
    const effects = await loadFoundingTechEffects(
      db,
      corporation,
      { sectorType: "manufacturing", industryModel: "vehicles", mediaDiscriminator: null },
      1991
    );
    expect(getSectorTechEffects).toHaveBeenCalledWith(
      expect.objectContaining({ type: "energy" }),
      "manufacturing",
      "vehicles",
      null
    );
    expect(upkeptDominanceShield).toHaveBeenCalledWith(
      expect.objectContaining({ type: "energy" }),
      "manufacturing",
      "vehicles",
      null,
      1991,
      0
    );
    expect(effects).toEqual({
      expansionDiscount: 0.15,
      growthCostMultiplier: 0.9,
      dominanceShield: 0.1,
    });
  });

  it("applies no tech when the tree is off", async () => {
    techTreesEnabled.value = false;
    const effects = await loadFoundingTechEffects(
      db,
      corporation,
      { sectorType: "energy", industryModel: null, mediaDiscriminator: null },
      1991
    );
    expect(effects).toEqual({ expansionDiscount: 0, growthCostMultiplier: 1, dominanceShield: 0 });
    expect(getSectorTechEffects).not.toHaveBeenCalled();
  });
});
