import { describe, expect, it } from "vitest";
import {
  LEGISLATION_ERA,
  WINDOW_CONSTRAINT_WAIVERS,
  GATED_REVENUE_ACK,
  LEGISLATION_ERA_UNTIL,
  isLegislationTypeActive,
  isLegislationTypeFileable,
  isNewThisEra,
} from "./legislationCatalog";

describe("legislation era resolvers", () => {
  it("null year (flag off) ⇒ every type active, never new", () => {
    expect(isLegislationTypeActive("ie_ai_liability_act", null)).toBe(true);
    expect(isLegislationTypeActive("us_medicaid", null)).toBe(true);
    expect(isNewThisEra("ie_ai_liability_act", null)).toBe(false);
  });

  it("unknown / unlisted typeId ⇒ always active (fail-open)", () => {
    expect(isLegislationTypeActive("us_social_security", 1900)).toBe(true);
    expect(isLegislationTypeActive("totally_made_up", 1900)).toBe(true);
  });

  it("windowed type: inactive at from-1, active at from", () => {
    expect(LEGISLATION_ERA.ie_ai_liability_act).toBe(2027);
    expect(isLegislationTypeActive("ie_ai_liability_act", 2026)).toBe(false);
    expect(isLegislationTypeActive("ie_ai_liability_act", 2027)).toBe(true);
    expect(isLegislationTypeActive("ie_ai_liability_act", 2028)).toBe(true);
  });

  it("isNewThisEra true only within [from, from+2]", () => {
    expect(isNewThisEra("ie_ai_liability_act", 2026)).toBe(false); // pre-window
    expect(isNewThisEra("ie_ai_liability_act", 2027)).toBe(true); // from
    expect(isNewThisEra("ie_ai_liability_act", 2029)).toBe(true); // from+2
    expect(isNewThisEra("ie_ai_liability_act", 2030)).toBe(false); // from+3
  });

  it("waiver + ack sets reference real classified types", () => {
    expect(WINDOW_CONSTRAINT_WAIVERS.has("ie_excise_duty")).toBe(true);
    expect(GATED_REVENUE_ACK.has("ng_petroleum_profit_tax")).toBe(true);
  });

  it("era-universal types are explicit 'always', not gaps", () => {
    expect(LEGISLATION_ERA.ie_agricultural_subsidies).toBe("always");
    expect(isLegislationTypeActive("ie_agricultural_subsidies", 1900)).toBe(true);
  });
});

describe("untilYear: filing closes, enacted laws stay in force", () => {
  const typeId = "ie_regional_health";

  function withUntil(year: number, run: () => void) {
    LEGISLATION_ERA_UNTIL[typeId] = year;
    try {
      run();
    } finally {
      delete LEGISLATION_ERA_UNTIL[typeId];
    }
  }

  it("ships with only the retirements that have a named successor", () => {
    const prefixes = ["ie"];
    const slugs = [
      "automation_tax",
      "coal_phase_out",
      "data_protection_overhaul",
      "basic_income_pilot",
      "ai_liability_act",
      "pension_age_indexation",
      "clean_power_standard",
    ];
    expect(Object.keys(LEGISLATION_ERA_UNTIL).sort()).toEqual(
      prefixes.flatMap((prefix) => slugs.map((slug) => `${prefix}_${slug}`)).sort()
    );
    expect(LEGISLATION_ERA_UNTIL[typeId]).toBeUndefined();
  });

  it("without an untilYear, fileable tracks the window exactly", () => {
    for (const year of [2020, 2021, 2050, null]) {
      expect(isLegislationTypeFileable(typeId, year)).toBe(isLegislationTypeActive(typeId, year));
    }
  });

  it("blocks new filing from the untilYear on", () => {
    withUntil(2035, () => {
      expect(isLegislationTypeFileable(typeId, 2034)).toBe(true);
      expect(isLegislationTypeFileable(typeId, 2035)).toBe(false);
      expect(isLegislationTypeFileable(typeId, 2050)).toBe(false);
      // Income and capital tier provisions resolve to their base type.
      expect(isLegislationTypeFileable(`${typeId}__income_low`, 2035)).toBe(false);
    });
  });

  it("keeps the type active, so enacted laws keep their budget lines and effects", () => {
    withUntil(2035, () => {
      expect(isLegislationTypeActive(typeId, 2035)).toBe(true);
      expect(isLegislationTypeActive(typeId, 2050)).toBe(true);
    });
  });

  it("null year (flag off) still files everything", () => {
    withUntil(2035, () => {
      expect(isLegislationTypeFileable(typeId, null)).toBe(true);
    });
  });

  it("does not reopen a type before its first fileable year", () => {
    withUntil(2035, () => {
      expect(isLegislationTypeFileable(typeId, 2004)).toBe(false);
    });
  });
});
