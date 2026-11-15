import { describe, expect, it } from "vitest";
import {
  INTERNATIONAL_ORGANIZATIONS,
  type BuiltInInternationalOrganizationId,
} from "@/lib/constants/internationalOrganizations";
import { canTableResolutionType } from "@/lib/constants/orgCategory";
import {
  DIRECTIVE_DURATION_TURNS,
  TREATY_TERM_TURNS,
  directiveDurationTurns,
  directivesForOrganization,
  getDirectiveDef,
} from "@/lib/constants/orgDirectives";
import { BUILTIN_ORG_IDENTITY } from "@/lib/constants/orgIdentity";
import { isOrganizationFounded, resolveSeedRoster } from "./founding";
import { buildDirectiveNudgesByCountry } from "./directives";

const TREATIES: Array<{ id: BuiltInInternationalOrganizationId; year: number; terms: string }> = [
  { id: "CRITICAL_MINERALS_CLUB", year: 2028, terms: "critical_minerals_terms" },
  { id: "CLIMATE_ADAPTATION_PACT", year: 2029, terms: "climate_adaptation_terms" },
  { id: "AI_SAFETY_ACCORD", year: 2030, terms: "ai_safety_terms" },
  { id: "ARCTIC_AGREEMENT", year: 2032, terms: "arctic_terms" },
  { id: "SPACE_TRAFFIC_RULES", year: 2034, terms: "space_traffic_terms" },
];

describe("post-2027 treaty organisations", () => {
  it.each(TREATIES)("$id does not exist before $year and founds empty", ({ id, year }) => {
    const def = INTERNATIONAL_ORGANIZATIONS[id];
    expect(def.foundedYear).toBe(year);
    expect(isOrganizationFounded({ def, liveYear: year - 1, hasMembers: false })).toBe(false);
    expect(isOrganizationFounded({ def, liveYear: year, hasMembers: false })).toBe(true);
    expect(isOrganizationFounded({ def, liveYear: 2050, hasMembers: false })).toBe(true);
    expect(resolveSeedRoster(def, "2027-default")).toEqual([]);
    expect(BUILTIN_ORG_IDENTITY[id].founded).toBe(year);
  });

  it("keeps the AI safety accord closed until 2030", () => {
    const def = INTERNATIONAL_ORGANIZATIONS.AI_SAFETY_ACCORD;
    expect(isOrganizationFounded({ def, liveYear: 2029, hasMembers: false })).toBe(false);
    expect(isOrganizationFounded({ def, liveYear: 2030, hasMembers: false })).toBe(true);
  });

  it.each(TREATIES)("$id can table its own five-year terms", ({ id, terms }) => {
    const def = INTERNATIONAL_ORGANIZATIONS[id];
    expect(canTableResolutionType(def.category, "directive")).toBe(true);
    expect(canTableResolutionType(def.category, "free_trade_agreement")).toBe(true);
    expect(directivesForOrganization(id).map((d) => d.key)).toContain(terms);
    expect(directiveDurationTurns(terms)).toBe(TREATY_TERM_TURNS);
  });

  it("keeps each treaty's terms out of every other organisation", () => {
    for (const { terms, id } of TREATIES) {
      for (const other of ["EU", ...TREATIES.map((t) => t.id).filter((t) => t !== id)]) {
        expect(directivesForOrganization(other).map((d) => d.key)).not.toContain(terms);
      }
    }
    // General directives keep their old term.
    expect(directiveDurationTurns("productivity_compact")).toBe(DIRECTIVE_DURATION_TURNS);
  });

  it("does not stack renewed terms that are still in force", () => {
    const def = getDirectiveDef("ai_safety_terms")!;
    const out = buildDirectiveNudgesByCountry(
      [
        { organizationId: "AI_SAFETY_ACCORD", directiveKey: "ai_safety_terms" },
        { organizationId: "AI_SAFETY_ACCORD", directiveKey: "ai_safety_terms" },
      ],
      new Map([["AI_SAFETY_ACCORD", ["JP", "DE"]]])
    );
    expect(out.get("JP")?.get(def.metricId)).toBe(def.delta);
  });
});
