import { describe, expect, it } from "vitest";
import { CORPORATION_TYPES } from "../corporations";
import { getSectorStrategies, type SectorStrategy } from "../sectorStrategies";
import { getDecadeById, getResearchableDecades, isDecadeReached } from "./decades";
import { TECH_TREE } from "./nodes";
import { getStrategyAvailability } from "./strategyAvailability";
import { ADOPTION_LAG_YEARS, HIGH_READINESS, LOW_READINESS, strategyOpenYear } from "./diffusion";

/** A method counts as new in a year when its tier opened no more than this many years earlier. */
const NEW_METHOD_WINDOW_YEARS = 12;
const CHECK_YEARS = [2045, 2051] as const;

/** Sector rows with the same operating strategies share a tree; each type is checked on its own. */
const SECTORS = CORPORATION_TYPES.filter((type) => getSectorStrategies(type, true).length > 0);

function newMethods(type: (typeof CORPORATION_TYPES)[number], year: number): SectorStrategy[] {
  return getSectorStrategies(type, true).filter((s) => {
    if (!s.minDecade || !s.requiresTechUnlock) return false;
    const tier = getDecadeById(s.minDecade);
    return (
      !!tier &&
      tier.startYear <= year &&
      year - tier.startYear <= NEW_METHOD_WINDOW_YEARS &&
      isDecadeReached(s.minDecade, year)
    );
  });
}

describe("every sector keeps research and new methods in the 2040s and 2050s", () => {
  it("covers every sector type", () => {
    expect(SECTORS.length).toBe(CORPORATION_TYPES.length);
  });

  it.each(CHECK_YEARS)("has researchable tiers with nodes in %i", (year) => {
    const decades = new Set(getResearchableDecades(year).map((d) => d.id));
    for (const type of SECTORS) {
      const nodes = TECH_TREE[type].filter((n) => decades.has(n.decadeId));
      expect(nodes.length, `${type} ${year}`).toBeGreaterThan(0);
    }
  });

  it.each(CHECK_YEARS)("has at least one new method open to research in %i", (year) => {
    for (const type of SECTORS) {
      expect(newMethods(type, year).length, `${type} ${year}`).toBeGreaterThan(0);
    }
  });

  it("gives every new method a tech node that unlocks it and real inputs", () => {
    for (const type of SECTORS) {
      for (const year of CHECK_YEARS) {
        for (const method of newMethods(type, year)) {
          const unlockers = TECH_TREE[type].filter((n) =>
            n.effects.some((e) => e.kind === "unlockStrategy" && e.strategyId === method.id)
          );
          expect(unlockers.length, `${type}:${method.id} unlock node`).toBeGreaterThan(0);
          expect(unlockers[0]!.decadeId, `${type}:${method.id} node tier`).toBe(method.minDecade);
          expect(
            Object.keys(method.demand).length,
            `${type}:${method.id} inputs`
          ).toBeGreaterThanOrEqual(3);
          const corp = { type, unlockedTechNodeIds: unlockers.map((n) => n.id) };
          const open = getStrategyAvailability(corp, method, year, true, {
            sectorResearch: 1e9,
            laneResearch: new Map(CORPORATION_TYPES.map((t) => [t, 1e9])),
          });
          expect(open.locked, `${type}:${method.id} open in ${year}`).toBe(false);
        }
      }
    }
  });
});

describe("the same new method reaches countries years apart", () => {
  const adopter = "npp" as const;

  it.each(SECTORS)("%s: readiness decides the adoption year of its newest method", (type) => {
    const method = newMethods(type, 2051).at(-1)!;
    const open = (readiness: number) =>
      strategyOpenYear(method, { readiness, foreignOperated: false, adopter })!;
    const leader = open(HIGH_READINESS + 0.1);
    const middle = open((HIGH_READINESS + LOW_READINESS) / 2);
    const laggard = open(LOW_READINESS - 0.1);
    const tier = getDecadeById(method.minDecade!)!.startYear;
    expect(leader).toBe(tier + ADOPTION_LAG_YEARS.high);
    expect(middle).toBe(tier + ADOPTION_LAG_YEARS.mid);
    expect(laggard).toBe(tier + ADOPTION_LAG_YEARS.low);
    expect(laggard - leader).toBeGreaterThanOrEqual(5);
  });
});
