import { describe, expect, it } from "vitest";
import { COUNTRY_CONFIGS, COUNTRY_ORDER } from "@/lib/constants/countries";
import { PM_VACANCY_DEADLINE_TURNS } from "@/lib/constants/turnTime";
import {
  getSuccessionRule,
  getSuccessionRuleKeys,
  openExecutiveVacancy,
  successionStage,
} from "./executiveSuccession";

describe("succession table", () => {
  it("has a rule for every registered country under its default government type", () => {
    for (const id of COUNTRY_ORDER) {
      expect(() => getSuccessionRule(id, COUNTRY_CONFIGS[id].governmentType), id).not.toThrow();
    }
  });

  it("throws for a country and government type with no entry", () => {
    expect(() => getSuccessionRule("UK", "presidential")).toThrow(/No executive succession rule/);
  });

  it("never lets the fill deadline come before the acting period ends", () => {
    for (const key of getSuccessionRuleKeys()) {
      const [country, type] = key.split(":") as [string, string];
      const rule = getSuccessionRule(country, type);
      expect(rule.fillWithinTurns, key).toBeGreaterThanOrEqual(rule.actingTurns);
    }
  });

  it("gives parliamentary formation the same window as the vacancy auto-snap", () => {
    expect(getSuccessionRule("UK", "parliamentaryMonarchy").fillWithinTurns).toBe(
      PM_VACANCY_DEADLINE_TURNS
    );
  });

  it("makes the vice president permanent in Brazil and Nigeria and the prime minister act in France", () => {
    expect(getSuccessionRule("BR", "presidential")).toMatchObject({
      fill: "deputy_permanent",
      actingOffice: "vicePresident",
    });
    expect(getSuccessionRule("NG", "presidential").fill).toBe("deputy_permanent");
    expect(getSuccessionRule("FR", "presidential")).toMatchObject({
      fill: "direct_election",
      actingOffice: "primeMinister",
    });
  });
});

describe("vacancy timetable", () => {
  const rule = getSuccessionRule("FR", "presidential");

  it("computes acting and fill deadlines from the vacancy turn", () => {
    const vacancy = openExecutiveVacancy(rule, 100);
    expect(vacancy.actingUntilTurn).toBe(100 + rule.actingTurns);
    expect(vacancy.fillByTurn).toBe(100 + rule.fillWithinTurns);
  });

  it("moves from acting to awaiting a fill to overdue", () => {
    const vacancy = openExecutiveVacancy(rule, 100);
    expect(successionStage(vacancy, 100)).toBe("acting");
    expect(successionStage(vacancy, vacancy.actingUntilTurn)).toBe("acting");
    expect(successionStage(vacancy, vacancy.actingUntilTurn + 1)).toBe("awaiting_fill");
    expect(successionStage(vacancy, vacancy.fillByTurn)).toBe("awaiting_fill");
    expect(successionStage(vacancy, vacancy.fillByTurn + 1)).toBe("overdue");
  });
});
