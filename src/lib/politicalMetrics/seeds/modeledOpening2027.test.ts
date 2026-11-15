import { describe, expect, it } from "vitest";
import type { PoliticalMetricId } from "../types";
import { deriveCountryBoard } from "../derive/deriveFamilies";
import { countryLeanFromParties } from "../derive/countryLean";
import { loadSeededStateMetrics } from "@/lib/states/conditions/seedMetricsLoader";
import { partySeedsForPreset } from "@/lib/seeds/partySeedRegistry";
import { NON_PLAYABLE_APPROVAL_NEUTRALS } from "./approvalNeutrals";

import {
  APPROVAL_AFFINITY_WEIGHT,
  APPROVAL_OBJECTIVE_WEIGHT,
  affinityScore,
  approvalNeutralFor,
  objectiveScore,
} from "@/lib/politicalLegislation/rules/approval";
import opening from "./modeledOpening2027.json";

// Executable derivation/provenance for the committed modeled opening. Changing
// source metrics requires regenerating both boards and intercepts together.
describe("modeled 2027 political opening", () => {
  it.each(Object.keys(opening.boards) as Array<keyof typeof opening.boards>)(
    "calibrates every authored %s region",
    async (country) => {
      const regions = Object.entries(opening.populations[country]).map(([_id, population]) => ({
        _id,
        population,
      }));
      const populations = new Map(regions.map((r) => [String(r._id), r.population]));
      const actual = opening.boards[country] as Record<string, Record<PoliticalMetricId, number>>;
      const lean = countryLeanFromParties(
        partySeedsForPreset(country, "2027-default"),
        "2027-default"
      );
      let weighted = 0;
      let population = 0;
      expect(Object.keys(actual).sort()).toEqual([...populations.keys()].sort());
      const metrics =
        country === "PL" || country === "RO" || country === "BG"
          ? await (
              await import("@/lib/admin/seed/seedModernTransitionCountries")
            ).loadModernTransitionMetricsBundle(country, "2027-default")
          : country === "HU"
            ? (await import("@/lib/countries/hu/data/huStateMetrics2027")).huStateMetrics2027
            : loadSeededStateMetrics(country, "2027-default");
      for (const metric of metrics) {
        const id = String(metric._id);
        if (!populations.has(id)) continue;
        const flat: Record<string, number> = {};
        for (const [category, values] of Object.entries(metric)) {
          if (!values || typeof values !== "object") continue;
          for (const [key, value] of Object.entries(values)) {
            const n = (value as { value?: number } | null)?.value;
            if (typeof n === "number" && Number.isFinite(n)) flat[`${category}.${key}`] = n;
          }
        }
        const derived = deriveCountryBoard({
          countryId: country,
          legacy: flat,
          macro: flat,
          year: 2027,
          lean,
        });
        expect(derived.unauthored).toEqual([]);
        const board = Object.fromEntries(
          Object.entries(derived.values).map(([key, family]) => [
            key,
            Math.round(family.value * 10) / 10,
          ])
        ) as Record<PoliticalMetricId, number>;
        expect(actual[id]).toEqual(board);
        expect(Object.keys(board)).toHaveLength(63);
        weighted +=
          (APPROVAL_OBJECTIVE_WEIGHT * objectiveScore(board) +
            APPROVAL_AFFINITY_WEIGHT * affinityScore(board, 0)) *
          populations.get(id)!;
        population += populations.get(id)!;
      }
      const neutral = Math.round((weighted / population) * 100) / 100;
      expect(opening.neutrals[country]).toBe(neutral);
      expect(approvalNeutralFor(country, "2027-default")).toBe(neutral);
      expect(approvalNeutralFor(country, "2019-default")).toBe(
        NON_PLAYABLE_APPROVAL_NEUTRALS["2019-default"][country]
      );
    }
  );
});
