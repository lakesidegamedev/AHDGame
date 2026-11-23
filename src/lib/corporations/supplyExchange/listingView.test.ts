import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { loadOpenOffers, offerSort, openOffersFilter, openOffersPipeline } from "./listingView";
import { COMMODITIES_BY_NAME } from "./offerOrdering";

function makeDb(rows: unknown[], publishers: unknown[]) {
  const aggregate = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) });
  const db = {
    collection: (name: string) =>
      name === "supplyListings"
        ? { aggregate }
        : { find: () => ({ project: () => ({ toArray: async () => publishers }) }) },
  } as unknown as Db;
  /** The pipeline stages of the nth read, keyed by stage name. */
  const stages = (n = 0) =>
    Object.assign({}, ...(aggregate.mock.calls[n][0] as Record<string, unknown>[])) as Record<
      string,
      unknown
    >;
  return { db, aggregate, stages };
}

describe("loadOpenOffers", () => {
  const corpId = new ObjectId();
  const row = (n: number, ai = false) => ({
    _id: `l${n}`,
    corporationId: corpId,
    slot: n,
    side: "sell",
    commodity: "oil",
    volumeCap: 5,
    pricePremium: 0.1,
    expiresAtTurn: 99,
    publishedByUserId: "u",
    aiListed: ai,
  });

  it("spans commodities, skips earlier pages and reports hasMore", async () => {
    const { db, stages } = makeDb(
      [row(1, true), row(2, true), row(3, true)],
      [{ _id: corpId, name: "Acme" }]
    );
    const out = await loadOpenOffers(db, { turn: 5, viewerCorpIds: new Set(), limit: 2, page: 3 });
    expect(stages().$match).toEqual({
      commodity: { $in: [...COMMODITY_TYPES] },
      expiresAtTurn: { $gt: 5 },
    });
    expect(stages().$skip).toBe(4);
    expect(stages().$limit).toBe(3);
    expect(out.hasMore).toBe(true);
    expect(out.offers).toHaveLength(2);
    expect(out.offers[0].ai).toBe(true);
  });

  it("filters to one commodity when given", async () => {
    const { db, stages } = makeDb([], []);
    const out = await loadOpenOffers(db, {
      commodity: "oil",
      turn: 5,
      viewerCorpIds: new Set(),
      limit: 10,
    });
    expect(stages().$match).toEqual({ commodity: "oil", expiresAtTurn: { $gt: 5 } });
    expect(stages().$skip).toBeUndefined();
    expect(out).toEqual({ offers: [], hasMore: false });
  });
});

describe("offer filters and ordering", () => {
  it("builds the kind, side and commodity filter", () => {
    expect(
      openOffersFilter({ turn: 5, kind: "player", side: "sell", commodities: ["oil"] })
    ).toEqual({
      commodity: "oil",
      side: "sell",
      aiListed: { $ne: true },
      expiresAtTurn: { $gt: 5 },
    });
    expect(openOffersFilter({ turn: 5, kind: "npp", commodities: ["oil", "coal"] })).toEqual({
      commodity: { $in: ["oil", "coal"] },
      aiListed: true,
      expiresAtTurn: { $gt: 5 },
    });
  });

  it("lists players first for kind=all and sorts by the chosen key", () => {
    expect(offerSort("volume", "all")).toEqual({ aiListed: 1, volumeCap: -1, _id: 1 });
    expect(offerSort("premium", "player")).toEqual({ pricePremium: 1, _id: 1 });
  });

  it("flips the chosen key for the other direction and keeps the id tie-break", () => {
    expect(offerSort("volume", "player", "asc")).toEqual({ volumeCap: 1, _id: 1 });
    expect(offerSort("premium", "all", "desc")).toEqual({ aiListed: 1, pricePremium: -1, _id: 1 });
    expect(offerSort("newest", "npp", "asc")).toEqual({ updatedAt: 1, _id: 1 });
  });

  it("ranks commodities by display name only when sorting by name", () => {
    const byName = openOffersPipeline({ turn: 5, sort: "commodity", skip: 0, limit: 5 });
    expect(byName).toEqual([
      { $match: { commodity: { $in: [...COMMODITY_TYPES] }, expiresAtTurn: { $gt: 5 } } },
      {
        $addFields: {
          commodityNameRank: { $indexOfArray: [[...COMMODITIES_BY_NAME], "$commodity"] },
        },
      },
      { $sort: { aiListed: 1, commodityNameRank: 1, _id: 1 } },
      { $limit: 5 },
    ]);
    const byVolume = openOffersPipeline({ turn: 5, sort: "volume", skip: 10, limit: 5 });
    expect(byVolume.some((stage) => "$addFields" in stage)).toBe(false);
    expect(byVolume).toContainEqual({ $skip: 10 });
  });

  it("passes the sort to the read and adds logo and CEO display", async () => {
    const corpId = new ObjectId();
    const ceoId = new ObjectId();
    const { db, stages } = makeDb(
      [
        {
          _id: "l1",
          corporationId: corpId,
          slot: 1,
          side: "buy",
          commodity: "oil",
          volumeCap: 9,
          pricePremium: 0,
          expiresAtTurn: 99,
          publishedByUserId: "u",
        },
      ],
      [{ _id: corpId, name: "Acme", userId: "u", logoUrl: "/l.png", ceoId }]
    );
    const out = await loadOpenOffers(db, {
      turn: 5,
      viewerCorpIds: new Set(),
      limit: 10,
      kind: "player",
      sort: "volume",
    });
    expect(stages().$sort).toEqual({ volumeCap: -1, _id: 1 });
    expect(out.offers[0].corporationLogoUrl).toBe("/l.png");
  });
});
