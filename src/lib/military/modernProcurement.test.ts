import { describe, expect, it } from "vitest";
import {
  UNIT_TYPES,
  archetypeResearchBlock,
  getUnitTypesForYear,
  type UnitArchetype,
} from "@/lib/constants/militaryCore";
import { DEFENCE_STRATEGY_COMPONENT } from "./arsenalComponents";
import type { UnitDomain } from "@/lib/db/types/militaryUnit";

const MODERN: Array<{ domain: UnitDomain; type: string; year: number; grade: number }> = [
  { domain: "ground", type: "Counter-Drone Battalion", year: 2027, grade: 2 },
  { domain: "air", type: "Loitering Munition Wing", year: 2027, grade: 2 },
  { domain: "naval", type: "Autonomous Naval Drone Flotilla", year: 2030, grade: 2 },
  { domain: "space", type: "Space Sensing Constellation", year: 2030, grade: 2 },
  { domain: "air", type: "Directed Energy Air Defense Wing", year: 2040, grade: 3 },
];

function find(domain: UnitDomain, type: string): UnitArchetype {
  const a = UNIT_TYPES[domain].find((t) => t.type === type);
  if (!a) throw new Error(`missing ${type}`);
  return a;
}

describe("post-2027 procurement categories", () => {
  it.each(MODERN)("$type opens in $year, not the year before", ({ domain, type, year }) => {
    const names = (y: number) => getUnitTypesForYear(domain, y).map((t) => t.type);
    expect(names(year - 1)).not.toContain(type);
    expect(names(year)).toContain(type);
    expect(names(2050)).toContain(type);
  });

  it.each(MODERN)("$type has a research gate, upkeep and personnel", ({ domain, type, grade }) => {
    const a = find(domain, type);
    expect(a.requiredArsenalGrade).toBe(grade);
    expect(a.upkeep).toBeGreaterThan(0);
    expect(a.personnel).toBeGreaterThan(0);
    // Upkeep sits in the same band as existing archetypes: 3% to 6% of build cost.
    expect(a.upkeep / a.cost).toBeGreaterThan(0.03);
    expect(a.upkeep / a.cost).toBeLessThan(0.06);
  });

  it.each(MODERN)(
    "$type draws on an arsenal component some defence line supplies",
    ({ domain }) => {
      const supplied = Object.values(DEFENCE_STRATEGY_COMPONENT).some((ds) => ds.includes(domain));
      expect(supplied).toBe(true);
    }
  );
});

describe("archetypeResearchBlock", () => {
  const counterDrone = find("ground", "Counter-Drone Battalion");
  const directedEnergy = find("air", "Directed Energy Air Defense Wing");

  it("blocks a country whose arsenal has not reached the required grade", () => {
    expect(archetypeResearchBlock(counterDrone, 0)).toMatch(/Modernized materiel/);
    expect(archetypeResearchBlock(counterDrone, 1.9)).not.toBeNull();
    expect(archetypeResearchBlock(counterDrone, undefined)).not.toBeNull();
    expect(archetypeResearchBlock(directedEnergy, 2.5)).toMatch(/Cutting-Edge/);
  });

  it("allows the formation once the arsenal holds researched materiel", () => {
    expect(archetypeResearchBlock(counterDrone, 2)).toBeNull();
    expect(archetypeResearchBlock(directedEnergy, 3)).toBeNull();
  });

  it("never gates an archetype without a research requirement", () => {
    expect(archetypeResearchBlock(find("ground", "Infantry Division"), 0)).toBeNull();
  });
});
