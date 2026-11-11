import { describe, expect, it } from "vitest";
import { NATIONAL_SCOPE, getNationalDocId } from "./nationalScope";
import { NATIONAL_POLICY_STATE_IDS } from "@/lib/policy/nationalStateId";
import { countriesByTier } from "@/lib/world/eraRoster";
import { SOVEREIGNTY_REGIONS } from "@/lib/referendum/rules/sovereigntyRegions";
import type { CountryId } from "./countries";

describe("NATIONAL_SCOPE", () => {
  it("uses each country's national policy id for its metrics document", () => {
    for (const [docId, countryId] of Object.entries(NATIONAL_SCOPE)) {
      expect(NATIONAL_POLICY_STATE_IDS[countryId], countryId).toBe(docId);
    }
  });

  it("gives every 2027 player country and every independence successor a national document", () => {
    const successors = SOVEREIGNTY_REGIONS.flatMap((entry) =>
      entry.successorCountryId ? [entry.successorCountryId] : []
    );
    const required: CountryId[] = [...countriesByTier("2027-default", "player"), ...successors];
    expect(required).toContain("CA");
    expect(required).toContain("QC");
    for (const countryId of required) {
      expect(getNationalDocId(countryId), countryId).toBeDefined();
    }
  });
});
