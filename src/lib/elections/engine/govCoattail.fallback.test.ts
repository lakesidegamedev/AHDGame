import { expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/politicalLegislation/politicalApprovalProvider", () => ({
  isPoliticalApprovalCountry: () => true,
  loadPoliticalApprovalBases: async () => ({
    byRegion: new Map([["CA", 50]]),
    modifiersByRegion: new Map([["CA", []]]),
    regionalModifiersByRegion: new Map([
      ["CA", [{ id: "regionalDebt", label: "Regional debt", effect: -20 }]],
    ]),
  }),
}));
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({ fullSimulationIds: [] }),
}));
vi.mock("@/lib/governorOffice/address/activeAddressModifiers", () => ({
  getActiveAddressApprovalModifiers: async () => [{ id: "address", label: "Address", effect: 3 }],
}));
vi.mock("@/lib/redistricting/fairnessApproval", () => ({
  getActiveFairnessGapModifiers: async () =>
    new Map([["CA", [{ id: "fairness", label: "Fairness", effect: -2 }]]]),
}));
import { getRegionalApprovalData } from "@/lib/states/approval/getRegionalApprovalData";
import { resolveGovExecutiveApproval } from "./govCoattail";
it("uses the complete page fallback for election coattails before the first snapshot", async () => {
  const db = createMockDb();
  db.collection("electedOfficials").findOne.mockResolvedValue({
    party: "2",
    officeType: "governor",
    state: "CA",
    countryId: "US",
  });
  db.collection("states")
    .find()
    .toArray.mockResolvedValue([{ _id: "CA", countryId: "US" }]);
  db.collection("macroMetrics").findOne.mockResolvedValue({ _id: "CA", countryId: "US" });
  db.collection("macroMetrics")
    .find()
    .toArray.mockResolvedValue([{ _id: "CA", countryId: "US" }]);
  db.collection("gameState").findOne.mockResolvedValue({
    currentTurn: 1,
    currentYear: 2027,
    startingYear: 2027,
    preset: "2027-default",
  });
  const page = await getRegionalApprovalData(db as unknown as Db, "US", "CA");
  const election = await resolveGovExecutiveApproval(db as unknown as Db, "US", "CA");
  expect(page?.approval).toBe(31);
  expect(election).toEqual({ partyId: "2", approval: page!.approval });
});
