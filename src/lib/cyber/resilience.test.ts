import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { cyberMandateTypeIdFor, loadCyberResilience } from "./resilience";
import { modernEraLegislationTypes } from "@/lib/seeds/shared/modernEraLegislation";

function fakeDb(rows: Record<string, unknown[]>) {
  const reads: string[] = [];
  const db = {
    collection(name: string) {
      return {
        find() {
          reads.push(name);
          return { toArray: async () => rows[name] ?? [] };
        },
      };
    },
  };
  return { db: db as unknown as Db, reads };
}

describe("cyberMandateTypeIdFor", () => {
  it("names a real seeded law for the countries that have one", () => {
    const ids = new Set(modernEraLegislationTypes.map((t) => t._id));
    for (const countryId of ["DE", "JP", "CN", "IE"]) {
      expect(ids.has(cyberMandateTypeIdFor(countryId)!)).toBe(true);
    }
    expect(cyberMandateTypeIdFor("US")).toBeNull();
  });
});

describe("loadCyberResilience", () => {
  it("reads each collection once and scores the enacted mandate", async () => {
    const { db, reads } = fakeDb({
      politicalMetrics: [
        { countryId: "DE", values: { "infrastructure.utilities": 60 } },
        { countryId: "JP", values: { "infrastructure.utilities": 60 } },
      ],
      macroMetrics: [
        { countryId: "DE", economic: { rdIntensity: { value: 3 } } },
        { countryId: "JP", economic: { rdIntensity: { value: 3 } } },
      ],
      statePolicies: [{ legislationTypeId: "de_cyber_resilience_mandate", policyOptionIndex: 0 }],
    });
    const [de, jp, br] = await loadCyberResilience(db, ["DE", "JP", "BR"]);
    expect(reads.sort()).toEqual(["macroMetrics", "politicalMetrics", "statePolicies"]);
    expect(de.resilience!).toBeGreaterThan(jp.resilience!);
    expect(br.resilience).toBeNull();
  });

  it("skips the law read when no country has the mandate law", async () => {
    const { db, reads } = fakeDb({});
    await loadCyberResilience(db, ["US", "BR"]);
    expect(reads).not.toContain("statePolicies");
  });
});
