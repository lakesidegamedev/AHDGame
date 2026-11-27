import { describe, it, expect, vi } from "vitest";
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

it("resumes a partially applied decay without reducing the first election again", async () => {
  const memory = createInMemoryDb();
  memory.seed(
    "elections",
    ["one", "two"].map((_id) => ({
      _id,
      electionType: "house",
      status: "active",
      districtCampaignBoosts: { "1": { "2": 7.5 } },
    }))
  );
  const col = memory.collection("elections"),
    bulk = col.bulkWrite.bind(col);
  const fault = vi.spyOn(col, "bulkWrite").mockImplementationOnce(async (ops) => {
    await bulk([ops[0]]);
    throw new Error("interrupted batch");
  });
  await expect(
    processCampaignBoostDecay(10, new Date(), memory as unknown as Db)
  ).rejects.toThrow();
  fault.mockRestore();
  await processCampaignBoostDecay(10, new Date(), memory as unknown as Db);
  expect(col.docs.map((row) => row.districtCampaignBoosts)).toEqual([
    { "1": { "2": 7 } },
    { "1": { "2": 7 } },
  ]);
  expect(
    (await processCampaignBoostDecay(10, new Date(), memory as unknown as Db)).electionsDecayed
  ).toBe(0);
  await processCampaignBoostDecay(11, new Date(), memory as unknown as Db);
  expect(col.docs.map((row) => row.districtCampaignBoosts)).toEqual([
    { "1": { "2": 6.5 } },
    { "1": { "2": 6.5 } },
  ]);
});
