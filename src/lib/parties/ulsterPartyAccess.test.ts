import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { canCharacterJoinParty, getPartyFrontiers, getTerritoryAdjacency } from "./partyFrontier";

describe("Ulster party access after reunification", () => {
  it("agrees between the page frontier and the join endpoint", async () => {
    const db = createInMemoryDb();
    db.seed(
      "states",
      ["DUB", "KIL", "MID", "WEX", "LIM", "COR", "GAL", "DON", "NIR"].map((_id) => ({
        _id,
        countryId: "IE",
      }))
    );
    db.seed("npps", [
      { _id: new ObjectId(), countryId: "IE", homeState: "DON", party: "4", retiredAt: null },
    ]);
    const frontiers = await getPartyFrontiers(db as unknown as Db, "IE", ["4"]);
    expect(frontiers.get("4")).toContain("NIR");
    expect(
      await canCharacterJoinParty(
        db as unknown as Db,
        { homeState: "NIR" },
        { sequentialId: 4, name: "Example party" },
        "IE"
      )
    ).toEqual({ ok: true });
  });
  it("does not turn the fix into unrestricted nationwide membership", async () => {
    const db = createInMemoryDb();
    db.seed(
      "states",
      ["COR", "LIM", "WEX", "KIL", "DON", "NIR"].map((_id) => ({ _id, countryId: "IE" }))
    );
    db.seed("npps", [
      { _id: new ObjectId(), countryId: "IE", homeState: "COR", party: "4", retiredAt: null },
    ]);
    expect(
      (
        await canCharacterJoinParty(
          db as unknown as Db,
          { homeState: "NIR" },
          { sequentialId: 4, name: "Example party" },
          "IE"
        )
      ).ok
    ).toBe(false);
  });
  it("keeps pre-reunification territory traversal inside Irish regions", () => {
    expect(getTerritoryAdjacency("IE", ["DUB", "KIL", "DON"])).not.toHaveProperty("NIR");
  });
});
