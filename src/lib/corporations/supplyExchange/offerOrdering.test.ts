import { describe, expect, it } from "vitest";
import { COMMODITY_LABELS, COMMODITY_TYPES } from "@/lib/constants/commoditiesCore";
import {
  COMMODITIES_BY_NAME,
  DEFAULT_OFFER_VIEW,
  offerCountLabel,
  offerSortDirLabels,
  offerSortSpec,
  offerSortsFor,
  offerViewNarrows,
  parseOfferView,
} from "./offerOrdering";

describe("offerSortSpec", () => {
  it("starts each sort in its natural direction", () => {
    expect(offerSortSpec("volume", "player")).toEqual({ volumeCap: -1, _id: 1 });
    expect(offerSortSpec("premium", "player")).toEqual({ pricePremium: 1, _id: 1 });
    expect(offerSortSpec("newest", "player")).toEqual({ updatedAt: -1, _id: 1 });
    expect(offerSortSpec("commodity", "player")).toEqual({ commodityNameRank: 1, _id: 1 });
  });

  it("flips only the chosen key and always breaks ties by id", () => {
    expect(offerSortSpec("volume", "npp", "asc")).toEqual({ volumeCap: 1, _id: 1 });
    expect(offerSortSpec("commodity", "player", "desc")).toEqual({
      commodityNameRank: -1,
      _id: 1,
    });
  });

  it("keeps player offers ahead of NPP offers when both are listed", () => {
    const spec = offerSortSpec("volume", "all", "asc");
    expect(Object.keys(spec)).toEqual(["aiListed", "volumeCap", "_id"]);
    expect(spec.aiListed).toBe(1);
  });
});

describe("COMMODITIES_BY_NAME", () => {
  it("orders every commodity by the name players see, not its id", () => {
    expect([...COMMODITIES_BY_NAME].sort()).toEqual([...COMMODITY_TYPES].sort());
    const labels = COMMODITIES_BY_NAME.map((c) => COMMODITY_LABELS[c]);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")));
    // "Crude Oil" sorts under C even though its id is oil; "Electricity" is energy.
    expect(COMMODITIES_BY_NAME.indexOf("oil")).toBeLessThan(COMMODITIES_BY_NAME.indexOf("energy"));
  });
});

describe("parseOfferView", () => {
  it("restores a saved choice", () => {
    const saved = { kind: "all", side: "sell", commodity: "oil", sort: "volume", dir: "asc" };
    expect(parseOfferView(JSON.stringify(saved))).toEqual(saved);
  });

  it("falls back to the default for junk, unknown values or broken JSON", () => {
    expect(parseOfferView(null)).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView("{not json")).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView("[1,2]")).toEqual(DEFAULT_OFFER_VIEW);
    expect(
      parseOfferView({ kind: "bots", side: "up", commodity: "unobtainium", sort: "random" })
    ).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView({ sort: "premium", dir: "sideways" })).toMatchObject({
      sort: "premium",
      dir: "asc",
    });
  });

  it("drops the name sort and commodity filter on a single commodity's page", () => {
    const saved = { kind: "npp", side: "buy", commodity: "oil", sort: "commodity", dir: "asc" };
    expect(parseOfferView(saved, true)).toEqual({
      kind: "npp",
      side: "buy",
      commodity: "",
      sort: "newest",
      dir: "desc",
    });
  });
});

describe("view helpers", () => {
  it("offers the name sort only across commodities", () => {
    expect(offerSortsFor(false)).toContain("commodity");
    expect(offerSortsFor(true)).not.toContain("commodity");
  });

  it("knows when the filters hide offers", () => {
    expect(offerViewNarrows({ ...DEFAULT_OFFER_VIEW, kind: "all" })).toBe(false);
    expect(offerViewNarrows({ ...DEFAULT_OFFER_VIEW, kind: "all", side: "buy" })).toBe(true);
    expect(offerViewNarrows({ ...DEFAULT_OFFER_VIEW, kind: "all", commodity: "oil" })).toBe(true);
    expect(offerViewNarrows({ ...DEFAULT_OFFER_VIEW, kind: "all", commodity: "oil" }, true)).toBe(
      false
    );
  });

  it("counts shown against all offers only when some are hidden", () => {
    expect(offerCountLabel(12, 40)).toBe("12 of 40 offers");
    expect(offerCountLabel(40, 40)).toBe("40 open offers");
    expect(offerCountLabel(1, 1)).toBe("1 open offer");
    expect(offerCountLabel(1200, 3400)).toBe("1,200 of 3,400 offers");
  });

  it("names both directions in plain words", () => {
    expect(offerSortDirLabels("volume")).toEqual({ desc: "Largest first", asc: "Smallest first" });
    expect(offerSortDirLabels("premium")).toEqual({ asc: "Lowest first", desc: "Highest first" });
  });
});
