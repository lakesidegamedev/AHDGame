import { describe, expect, it } from "vitest";
import { POLITICAL_LEGISLATION_RETAINED_OLD_IDS } from "./pipelinePreset";
import { getAllNewGenerationLawIds } from "@/lib/politicalLegislation/catalog";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";

describe("old US/UK catalogs", () => {
  it("no longer exist in the reference catalog beyond the retained mechanical ids", () => {
    const leftovers = legislationTypes
      .filter((lt) => ["us", "uk"].includes(lt.countryScope ?? "us"))
      .map((lt) => lt._id)
      .filter(
        (id) => !POLITICAL_LEGISLATION_RETAINED_OLD_IDS.has(id.split(/__(?:income|capital)_/)[0])
      );
    expect(leftovers.filter((id) => !id.endsWith("_banking_separation"))).toEqual([]);
  });

  it("retains the state redistricting levers", () => {
    for (const id of [
      "us_state_redistricting_authority",
      "us_state_compactness",
      "us_state_fairness",
    ]) {
      expect(POLITICAL_LEGISLATION_RETAINED_OLD_IDS.has(id), id).toBe(true);
    }
  });
});

describe("POLITICAL_LEGISLATION_RETAINED_OLD_IDS", () => {
  it("names only ids that exist in the reference catalog", () => {
    const byId = new Set(legislationTypes.map((lt) => lt._id));
    for (const id of POLITICAL_LEGISLATION_RETAINED_OLD_IDS) {
      expect(byId.has(id), `retained id ${id} is not in the reference catalog`).toBe(true);
    }
  });

  it("never collides with a new-generation id", () => {
    // Both sets are upserted into legislationTypes by _id, so an overlap would
    // have one generation silently overwrite the other.
    const newGen = new Set(getAllNewGenerationLawIds());
    for (const id of POLITICAL_LEGISLATION_RETAINED_OLD_IDS) {
      expect(newGen.has(id), `retained id ${id} collides with a new-generation law`).toBe(false);
    }
  });
});
