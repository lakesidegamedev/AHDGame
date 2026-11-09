import { describe, expect, it } from "vitest";
import { COUNTRY_CONFIGS, COUNTRY_ORDER, getCountryConfig } from "@/lib/constants/countries";
import { RU_RUSSIAN_1991 } from "@/lib/countries/ru/russian1991Config";
import { getPresetEnablementCountries } from "@/lib/admin/seed/seedCountryGameStates";
import { PM_VACANCY_DEADLINE_TURNS, SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import {
  getSuccessionRule,
  getSuccessionRuleKeys,
  openExecutiveVacancy,
  successionRuleKey,
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

describe("succession table coverage by era", () => {
  it("has a rule for every country and government type each shipping preset can produce", () => {
    const missing: string[] = [];
    for (const preset of SEED_PRESET_IDS) {
      for (const id of getPresetEnablementCountries(preset) ?? []) {
        if (id === "US") continue;
        const types = new Set([getCountryConfig(id, preset).governmentType]);
        const settled = id === "RU" && preset === "1991-default";
        if (settled && RU_RUSSIAN_1991.config?.governmentType) {
          types.add(RU_RUSSIAN_1991.config.governmentType);
        }
        for (const type of types) {
          try {
            getSuccessionRule(id, type);
          } catch {
            missing.push(`${preset} ${successionRuleKey(id, type)}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
