import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import { REGION_TABLES } from "@/lib/seeds/contract/regionTables";
import { simulatesRegions } from "@/lib/seeds/contract/registry";
import { inBand, REGIONAL_GDP_BAND } from "@/lib/seeds/contract/rules/scale";
import {
  reconcileStateGdpWithNationalSeeds,
  shouldReconcileStateGdpForPreset,
  STATE_GDP_RECONCILE_TOLERANCE,
} from "./reconcileStateGdp";

/**
 * Region GDP (millions of local currency) must add up to the authored national
 * GDP after the seed step. The national figure is rebuilt from regions, so a
 * region table in another unit silently rescales a whole economy on its first
 * rebuild.
 *
 * Runs the real reconciler, database write included, over the region tables
 * the seeders use. Reconciled presets must land within the reconcile tolerance.
 * Presets left unreconciled must stay inside the seed contract's band, except
 * for the countries listed below, whose authored national figures need
 * correcting first. The list is exact: a new country drifting out of band, or a
 * listed one coming back in, fails until the list is updated.
 */
const UNRECONCILED_OUT_OF_BAND: Readonly<Record<string, readonly string[]>> = {
  "1999-default": ["CN", "IE", "NG", "TR"],
  "2007-default": ["BR", "CN", "IE", "NG", "TR", "UK"],
  "2019-default": ["AT", "ES", "FI", "FR", "GR", "IT", "NG", "SE", "TR"],
  "2023-default": ["NG", "TR"],
};

describe.each(SEED_PRESET_IDS)("region GDP matches national GDP after seeding: %s", (preset) => {
  const configs = getNationalBudgetSeedConfigsForPreset(preset);
  const rows = configs.flatMap((config) => {
    const countryId = String(config.countryId);
    const regions = REGION_TABLES[countryId];
    if (!simulatesRegions(preset, countryId) || !regions?.seededIn.includes(preset)) return [];
    return (regions.table[preset] ?? [])
      .filter((row) => !NATIONAL_SCOPE_IDS.has(String(row._id)))
      .map((row) => ({ _id: row._id, countryId, gdp: row.gdp }));
  });

  it("every country with regions sums to its authored GDP", async () => {
    const memory = createInMemoryDb();
    memory.seed("states", rows);
    await reconcileStateGdpWithNationalSeeds(memory as unknown as Db, () => {}, preset);
    const sums = new Map<string, number>();
    for (const doc of memory.collection("states").docs) {
      const id = String(doc.countryId);
      sums.set(id, (sums.get(id) ?? 0) + Number(doc.gdp ?? 0));
    }
    const reconciled = shouldReconcileStateGdpForPreset(preset);
    const outOfBand: string[] = [];
    for (const config of configs) {
      const sum = sums.get(String(config.countryId));
      if (sum === undefined) continue;
      const ratio = (sum * 1_000_000) / config.gdp;
      const detail = `${preset} ${config.countryId}: regions ${sum}M vs national ${config.gdp} (${ratio.toPrecision(4)}x)`;
      if (reconciled) {
        expect(Math.abs(ratio - 1), detail).toBeLessThan(STATE_GDP_RECONCILE_TOLERANCE);
      } else if (!inBand(ratio, REGIONAL_GDP_BAND)) {
        outOfBand.push(String(config.countryId));
      }
    }
    expect(outOfBand.sort()).toEqual([...(UNRECONCILED_OUT_OF_BAND[preset] ?? [])]);
  });
});

describe("the 2027 world", () => {
  it("is reconciled for every country, not only the US", () => {
    expect(shouldReconcileStateGdpForPreset("2027-default")).toBe(true);
  });
});
