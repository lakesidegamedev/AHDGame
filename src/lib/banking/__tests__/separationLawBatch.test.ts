import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { ALL_COUNTRY_IDS } from "@/lib/constants/countries";
import { getLegalCharterTypes, loadLegalCharterTypesForCountries } from "../separationLaw";

describe("batched charter eligibility", () => {
  it.each([1991, 2019])(
    "matches scalar eligibility for all countries in %i, including enacted overrides",
    async (year) => {
      const memory = createInMemoryDb();
      memory.seed("gameState", [
        {
          _id: "current",
          currentYear: year,
          currentTurn: 100,
          startingYear: year,
          preset: `${year}-default`,
        },
      ]);
      memory.seed("gameConfig", [{ _id: "default", commandEconomyEnabled: true }]);
      memory.seed("bankingLaws", [
        { _id: "US", separation: "universal", enactedTurn: 50 },
        { _id: "UK", separation: "separated", enactedTurn: 50 },
      ]);
      const db = memory as unknown as Db;
      const batch = await loadLegalCharterTypesForCountries(db, ALL_COUNTRY_IDS);
      for (const country of ALL_COUNTRY_IDS) {
        expect(batch.get(country), country).toEqual(await getLegalCharterTypes(db, country));
      }
      expect(batch.get("US")).toEqual(["retail", "investment", "universal"]);
      expect(batch.get("UK")).toEqual(["retail", "investment"]);
    }
  );
});
