import { ObjectId, type Db } from "mongodb";
import { describe, expect, it } from "vitest";
import type { CampaignFieldOffice } from "@/lib/db/types";
import {
  buildFieldOfficeMultiplier,
  loadFieldOfficesForElection,
  loadFieldOfficesByElection,
} from "./engine";

function office(candidateId: ObjectId, regionId: string, share: number): CampaignFieldOffice {
  return {
    _id: new ObjectId(),
    campaignId: new ObjectId(),
    electionId: new ObjectId(),
    candidateId,
    countryId: "US",
    regionId,
    subdivisionId: "42101",
    label: "Philadelphia",
    electorateShare: share,
    yieldFactor: 1,
    openedTurn: 0,
    openCostLocal: 0,
    openedByCharacterId: null,
    createdAt: new Date(0),
  };
}

describe("buildFieldOfficeMultiplier", () => {
  it("returns null when the race has no offices or the country has none", () => {
    expect(buildFieldOfficeMultiplier([], "US", 5)).toBeNull();
    expect(buildFieldOfficeMultiplier([office(new ObjectId(), "PA", 0.1)], "DE", 5)).toBeNull();
  });

  it("boosts only the owning candidate in the office's region", () => {
    const a = new ObjectId();
    const mult = buildFieldOfficeMultiplier([office(a, "PA", 0.12)], "US", 10)!;
    expect(mult(a.toString(), "PA")).toBeGreaterThan(1);
    expect(mult(a.toString(), "pa")).toBe(mult(a.toString(), "PA"));
    expect(mult(a.toString(), "OH")).toBe(1);
    expect(mult(new ObjectId().toString(), "PA")).toBe(1);
  });
});

// Apply the projection in the fake driver: returning full rows would hide the original bug.
describe("field-office database readers", () => {
  it("keeps county IDs through both projected readers for primary county redistribution", async () => {
    const row = office(new ObjectId(), "PA", 0.12);
    const db = {
      collection: () => ({
        find: (_filter: unknown, options: { projection: Record<string, number> }) => ({
          toArray: async () => [
            Object.fromEntries(
              Object.entries(row).filter(([key]) => key === "_id" || options.projection[key] === 1)
            ),
          ],
        }),
      }),
    } as unknown as Db;
    expect((await loadFieldOfficesForElection(db, row.electionId))[0].subdivisionId).toBe("42101");
    expect(
      (await loadFieldOfficesByElection(db)).get(row.electionId.toString())![0].subdivisionId
    ).toBe("42101");
  });
});
