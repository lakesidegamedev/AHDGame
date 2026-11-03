import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types";
import { enrichFundPositions } from "./fundPortfolioView";

function position(over: Partial<IndexFundPosition> = {}): IndexFundPosition {
  return {
    _id: new ObjectId(),
    fundId: new ObjectId(),
    holderKind: "character",
    characterId: new ObjectId(),
    units: 10,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  } as IndexFundPosition;
}

function fund(over: Partial<IndexFund> = {}): IndexFund {
  return {
    _id: new ObjectId(),
    slug: "example-fund",
    name: "Example Fund",
    tickerSymbol: "EXF",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 12.5,
    ...over,
  } as IndexFund;
}

describe("enrichFundPositions", () => {
  it("joins a position to its fund and values it at the quoted NAV", () => {
    const f = fund();
    const [row] = enrichFundPositions([position({ fundId: f._id, units: 10 })], [f]);
    expect(row).toMatchObject({
      fundId: "example-fund",
      slug: "example-fund",
      name: "Example Fund",
      tickerSymbol: "EXF",
      units: 10,
      currentNav: 12.5,
      marketValueAnchor: 125,
    });
  });

  it("defaults legacyUnits to the full position", () => {
    const f = fund();
    const [row] = enrichFundPositions([position({ fundId: f._id, units: 4 })], [f]);
    expect(row.legacyUnits).toBe(4);

    const [partial] = enrichFundPositions(
      [position({ fundId: f._id, units: 4, legacyUnits: 1 })],
      [f]
    );
    expect(partial.legacyUnits).toBe(1);
  });

  it("keeps the id and nulls the fund fields when the fund is missing", () => {
    const [row] = enrichFundPositions([position()], []);
    expect(row.slug).toBeNull();
    expect(row.marketValueAnchor).toBeNull();
    expect(row.fundId).toHaveLength(24);
  });
});
