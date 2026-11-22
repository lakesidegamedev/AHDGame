import { describe, expect, it } from "vitest";
import { buildInputReceipt } from "./inputReceipt";
import {
  bestMissReason,
  offerMissReason,
  unservedByReason,
  type UnfilledDemand,
} from "./unfilledReasons";
import {
  unservedDemandReason,
  UNSERVED_DEMAND_TEXT,
} from "@/lib/corporations/rules/unservedDemandReason";
import { inputBlockerText } from "@/lib/corporations/rules/inputShortageReading";

const demand = (over: Partial<UnfilledDemand> = {}): UnfilledDemand => ({
  missingUnits: 10,
  maximumUnitPrice: 5,
  eligible: null,
  spendLeft: 1000,
  ...over,
});
const offer = { id: "o1", unitPrice: 4 };

describe("offerMissReason", () => {
  it("names each blocker", () => {
    expect(offerMissReason(demand(), { ...offer, unitPrice: 6 })).toBe("price_above_limit");
    expect(offerMissReason(demand({ eligible: new Set(["x"]) }), offer)).toBe("not_eligible");
    expect(offerMissReason(demand({ spendLeft: 5 }), offer)).toBe("buyer_budget");
    expect(offerMissReason(demand(), offer)).toBe("not_delivered");
  });
  it("ignores an offer a named-supplier buyer never dealt with", () => {
    expect(offerMissReason(demand({ supplierOfferId: "other" }), offer)).toBeNull();
  });
  it("takes the reason nearest a sale across buyers", () => {
    const demands = [demand({ eligible: new Set(["x"]) }), demand({ spendLeft: 1 })];
    expect(bestMissReason(demands, offer)).toBe("buyer_budget");
  });
});

describe("plant receipt and seller text agree", () => {
  const base = {
    commodity: "steel",
    neededUnits: 10,
    stockUnits: 0,
    boughtUnits: 0,
    unsoldWithinLimitUnits: 0,
    unsoldAboveLimitUnits: 0,
  };
  it.each([
    ["price_above_limit", "ask_above_buyers"],
    ["not_eligible", "buyers_not_eligible"],
    ["buyer_budget", "buyers_out_of_funds"],
    ["not_delivered", "not_reached"],
  ] as const)("%s", (miss, seller) => {
    const receipt = buildInputReceipt({
      ...base,
      recorded: { nearestMiss: miss, bookHadOffers: true },
    });
    expect(receipt.blocker).toBe(miss);
    expect(inputBlockerText(receipt.blocker!)).toBeTruthy();
    expect(
      unservedDemandReason({
        unmetUnits: 5,
        offered: 10,
        soldOutside: 1,
        ownSites: 0,
        unservedBy: { [miss]: 5 },
      })
    ).toBe(seller);
    expect(UNSERVED_DEMAND_TEXT[seller]).not.toMatch(/[–—]/);
  });
  it("names an empty book and freight separately from sold out", () => {
    const rec = (bookHadOffers: boolean, commodity = "steel") =>
      buildInputReceipt({ ...base, commodity, recorded: { nearestMiss: null, bookHadOffers } });
    expect(rec(false).blocker).toBe("no_offers");
    expect(rec(true).blocker).toBe("sold_out");
    expect(rec(true, "freight").blocker).toBe("freight_capacity");
  });
  it("keeps the old inference without a recording", () => {
    expect(buildInputReceipt({ ...base, unsoldWithinLimitUnits: 3 }).blocker).toBe("not_delivered");
    expect(buildInputReceipt({ ...base }).blocker).toBe("sold_out");
  });
  it("sums seller-side units per reason", () => {
    expect(
      unservedByReason(
        [demand({ missingUnits: 3 }), demand({ missingUnits: 4, spendLeft: 0 })],
        offer
      )
    ).toEqual({ not_delivered: 3, buyer_budget: 4 });
  });
});
