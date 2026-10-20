import { describe, expect, it } from "vitest";
import {
  isOldLegislationTypeExcluded,
  isPoliticalPipelinePreset,
} from "@/lib/politicalMetrics/pipelinePreset";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import {
  MECHANICAL_LEGISLATION_ERA_ENTRIES,
  MECHANICAL_RETAINED_IDS,
  MECHANICAL_TYPE_IDS,
  NEW_GENERATION_COMPETITION_SCOPES,
  mechanicalLegislationTypes,
} from "./legislation";

const EFFECT_DIRECTION = [-1, -1, 0, 1, 1];

const NEW_GENERATION_SCOPES = ["us", "uk", "ru", "dd"] as const;

describe("mechanicalLegislationTypes", () => {
  it("makes every type national-only with five option levels", () => {
    for (const type of mechanicalLegislationTypes) {
      expect(type.allowedScope, type._id).toBe("national");
      expect(type.nationalOnly, type._id).toBe(true);
      expect(type.policyOptions, type._id).toHaveLength(5);
    }
  });

  it("moves no political metric and no budget line", () => {
    for (const type of mechanicalLegislationTypes) {
      expect(type, type._id).not.toHaveProperty("effectTarget");
      expect(type, type._id).not.toHaveProperty("effectTargetsWeighted");
      expect(type, type._id).not.toHaveProperty("budgetCategory");
      for (const option of type.policyOptions ?? []) {
        expect(option, option.id).not.toHaveProperty("metricEffects");
      }
    }
  });

  it("numbers its option ids by level and runs permissive to strict", () => {
    for (const type of mechanicalLegislationTypes) {
      (type.policyOptions ?? []).forEach((option, i) => {
        expect(option.id, type._id).toBe(`${type._id}_l${i}`);
        expect(option.effectDirection, option.id).toBe(EFFECT_DIRECTION[i]);
      });
    }
  });

  it("has unique ids", () => {
    expect(new Set(MECHANICAL_TYPE_IDS).size).toBe(mechanicalLegislationTypes.length);
  });

  it("generates no competition law for the new-generation countries", () => {
    for (const type of mechanicalLegislationTypes) {
      if (type.countryScope == null) continue;
      if (!NEW_GENERATION_COMPETITION_SCOPES.has(type.countryScope)) continue;
      expect(type._id.endsWith("_competition_law"), type._id).toBe(false);
    }
  });
});

describe("MECHANICAL_RETAINED_IDS", () => {
  it("names exactly the subsidiary and foreign investment laws of the four new-generation countries", () => {
    const expected = NEW_GENERATION_SCOPES.flatMap((scope) => [
      `${scope}_subsidiary_limits_law`,
      `${scope}_foreign_investment_law`,
    ]);
    expect([...MECHANICAL_RETAINED_IDS].sort()).toEqual(expected.sort());
    expect(MECHANICAL_RETAINED_IDS).toHaveLength(8);
  });
});

describe("MECHANICAL_LEGISLATION_ERA_ENTRIES", () => {
  it("maps every generated id to always", () => {
    expect(Object.keys(MECHANICAL_LEGISLATION_ERA_ENTRIES).sort()).toEqual(
      [...MECHANICAL_TYPE_IDS].sort()
    );
    for (const id of MECHANICAL_TYPE_IDS) {
      expect(MECHANICAL_LEGISLATION_ERA_ENTRIES[id], id).toBe("always");
    }
  });
});

describe("reference legislation catalog", () => {
  it("contains every generated mechanical law type", () => {
    const catalogIds = new Set(legislationTypes.map((type) => type._id));
    for (const id of MECHANICAL_TYPE_IDS) {
      expect(catalogIds.has(id), id).toBe(true);
    }
  });

  it("lets the political-legislation preset keep every generated type", () => {
    expect(isPoliticalPipelinePreset("1953-default")).toBe(true);
    for (const type of mechanicalLegislationTypes) {
      expect(
        isOldLegislationTypeExcluded({ _id: type._id, countryScope: type.countryScope }),
        type._id
      ).toBe(false);
    }
  });
});
