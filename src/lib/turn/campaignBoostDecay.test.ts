import { describe, it, expect } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processCampaignBoostDecay } from "./campaignBoostDecay";

describe("Campaign Here decay", () => {
  it("decays US and Canadian campaigns together and leaves closed/foreign race types untouched", async () => {
    const memory = createInMemoryDb();
    memory.seed("elections", [
      {
        _id: "us",
        countryId: "US",
        electionType: "house",
        status: "active",
        districtCampaignBoosts: { "1": { "2": 7.5 } },
      },
      {
        _id: "ca",
        countryId: "CA",
        electionType: "caCommons",
        status: "upcoming",
        districtCampaignBoosts: { "35001": { "1": 2.5 } },
      },
      {
        _id: "snap",
        countryId: "CA",
        electionType: "snap_caCommons",
        status: "active",
        districtCampaignBoosts: { "35001": { "1": 0.5 } },
      },
      {
        _id: "closed",
        countryId: "CA",
        electionType: "caCommons",
        status: "resolved",
        districtCampaignBoosts: { "35001": { "1": 5 } },
      },
      {
        _id: "provincial",
        countryId: "CA",
        electionType: "provincialLegislature",
        status: "active",
        districtCampaignBoosts: { "35001": { "1": 5 } },
      },
    ]);
    const result = await processCampaignBoostDecay(10, new Date(), memory as unknown as Db);
    expect(result.electionsDecayed).toBe(3);
    const rows = memory.collection("elections").docs;
    expect(rows[0].districtCampaignBoosts).toEqual({ "1": { "2": 7 } });
    expect(rows[1].districtCampaignBoosts).toEqual({ "35001": { "1": 2 } });
    expect(rows[2].districtCampaignBoosts).toBeUndefined();
    expect(rows[3].districtCampaignBoosts).toEqual({ "35001": { "1": 5 } });
    expect(rows[4].districtCampaignBoosts).toEqual({ "35001": { "1": 5 } });
  });
});
