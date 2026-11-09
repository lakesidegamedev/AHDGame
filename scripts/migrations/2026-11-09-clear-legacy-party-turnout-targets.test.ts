import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { clearLegacyPartyTurnoutTargets } from "./2026-11-09-clear-legacy-party-turnout-targets";

function fakeDb(rows: unknown[]) {
  const bulkWrite = vi.fn().mockResolvedValue({});
  const db = {
    collection: () => ({ find: () => ({ toArray: async () => rows }), bulkWrite }),
  } as unknown as Db;
  return { db, bulkWrite };
}

const rows = [
  { _id: 1, countryId: "UK", gotvTargetCategory: "uk_voterGroups", gotvTargetGroup: "x" },
  {
    _id: 2,
    countryId: "UK",
    gotvTargetCategory: "education",
    gotvTargetGroup: "degree_plus",
    suppressionTargetCategory: "race",
    suppressionTargetGroup: "black",
  },
  { _id: 3, countryId: "US", gotvTargetCategory: "race", gotvTargetGroup: "white" },
];

describe("clearLegacyPartyTurnoutTargets", () => {
  it("clears only targets the country's census does not have", async () => {
    const { db, bulkWrite } = fakeDb(rows);
    const result = await clearLegacyPartyTurnoutTargets(db, "1953-default", true);
    expect(result).toEqual({ scanned: 3, cleared: 2 });
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops[0].updateOne.update.$unset).toEqual({ gotvTargetCategory: "", gotvTargetGroup: "" });
    expect(ops[1].updateOne.update.$unset).toEqual({
      suppressionTargetCategory: "",
      suppressionTargetGroup: "",
    });
  });

  it("writes nothing on a dry run", async () => {
    const { db, bulkWrite } = fakeDb(rows);
    const result = await clearLegacyPartyTurnoutTargets(db, "1953-default", false);
    expect(result.cleared).toBe(2);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
