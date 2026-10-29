import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STALE_MARKET_MODE_STAMP_UNSET,
  STALE_PER_WORLD_GAME_CONFIG_UNSET,
} from "@/lib/admin/seed/coreGameConfigUpdate";
import { FRESH_WORLD_GAME_CONFIG_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";
import {
  FRESH_PLANTS_CONFIG_KEPT,
  FRESH_PLANTS_CONFIG_UNSET,
  freshPlantsGameConfigUpdate,
} from "./freshWorldConfig";

/** Field names declared on the GameConfig type. */
function gameConfigFields(): string[] {
  const source = readFileSync(resolve(process.cwd(), "src/lib/db/types/gameConfig.ts"), "utf8");
  return [...source.matchAll(/^\s{2}([a-zA-Z0-9_]+)\??:/gm)].map((m) => m[1]);
}

describe("fresh plants world configuration", () => {
  const unset = new Set(Object.keys(FRESH_PLANTS_CONFIG_UNSET));
  const kept = new Set(Object.keys(FRESH_PLANTS_CONFIG_KEPT));

  it("classifies every staged economy knob as unset or kept", () => {
    const staged = gameConfigFields().filter(
      (name) =>
        /^producer[A-Z]/.test(name) ||
        /^funded[A-Z]/.test(name) ||
        /^marketGovernor/.test(name) ||
        /Stage$/.test(name) ||
        /Scale$/.test(name) ||
        /Share$/.test(name) ||
        /PpPerDoubling$/.test(name) ||
        /Tolerance$/.test(name)
    );
    const unclassified = staged.filter((name) => !unset.has(name) && !kept.has(name));
    expect(
      unclassified,
      "Add each staged economy knob to FRESH_PLANTS_CONFIG_UNSET or FRESH_PLANTS_CONFIG_KEPT"
    ).toEqual([]);
  });

  it("puts each knob in exactly one list and never unsets a fresh-world flag", () => {
    for (const name of unset) expect(kept.has(name), name).toBe(false);
    for (const name of Object.keys(FRESH_WORLD_GAME_CONFIG_FLAGS))
      expect(unset.has(name), name).toBe(false);
    expect(unset.has("commodityFixStage")).toBe(false);
  });

  it("removes every governor, recovery and funded-market lever and restamps fresh flags", () => {
    const update = freshPlantsGameConfigUpdate();
    const removed = Object.keys(update.$unset ?? {});
    for (const name of [
      "marketRecoveryStage",
      "marketGovernorCap",
      "marketGovernorGlideStartTurn",
      "producerHouseholdIncomeFloor",
      "producerMarketLiveFromTurn",
      "commodityNominalPriceIndex",
      "countryRecessions",
      "inputDemandRealPhaseStartTurn",
    ])
      expect(removed, name).toContain(name);
    for (const name of [
      ...Object.keys(STALE_PER_WORLD_GAME_CONFIG_UNSET),
      ...Object.keys(STALE_MARKET_MODE_STAMP_UNSET),
    ])
      expect(removed, name).toContain(name);
    expect(update.$set).toMatchObject({
      marketSystemMode: "plants",
      centralBankPricingPhaseIn: {},
      marketGuardEnabled: false,
      equityLiquidityFacilityEnabled: false,
      nppMarketCoverageEnabled: false,
      producerShortageBuildFactor: 0.25,
      producerPriceMaxMove: 0.02,
      producerPriceMaxMultiplier: 2,
    });
    const set = new Set(Object.keys(update.$set ?? {}));
    for (const name of removed) expect(set.has(name), name).toBe(false);
    // A scheduled economy pause belongs to the rebuilt world, so a reset keeps it.
    expect(removed).not.toContain("economyPauseUntilTurn");
  });
});
