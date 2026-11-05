import { describe, expect, it } from "vitest";
import { agreementLeftAGap, fundedOwnSupplyReach, ownSupplyReach } from "./ownSupplyReach";

const base = {
  priority: "own" as const,
  buyerStateId: "KYU",
  sourceStateIds: ["HOK"],
  crossesStatesByFreight: true,
  routesFresh: true,
  routedUnitsIn: 0,
  hasAgreement: false,
};

describe("ownSupplyReach", () => {
  it("is null when no other site makes the input", () => {
    expect(ownSupplyReach({ ...base, sourceStateIds: [] })).toBeNull();
  });

  it("names the market priority alone, since nothing else applies under it", () => {
    expect(ownSupplyReach({ ...base, priority: "market", hasAgreement: true })).toEqual({
      sourceStateIds: ["HOK"],
      reasons: ["market_priority"],
    });
  });

  it("flags a missing haul when the input is made only in other states", () => {
    expect(ownSupplyReach(base)?.reasons).toEqual(["no_route"]);
  });

  it("does not flag a route for goods that ignore state lines", () => {
    expect(ownSupplyReach({ ...base, crossesStatesByFreight: false })?.reasons).toEqual([
      "not_enough",
    ]);
  });

  it("does not flag a route when the input is also made in the plant's state", () => {
    expect(ownSupplyReach({ ...base, sourceStateIds: ["HOK", "KYU"] })?.reasons).toEqual([
      "not_enough",
    ]);
  });

  it("lists an agreement beside a missing haul", () => {
    expect(ownSupplyReach({ ...base, hasAgreement: true })?.reasons).toEqual([
      "no_route",
      "agreement_reserved",
    ]);
  });

  it("reads a haul that arrived as own supply falling short", () => {
    expect(ownSupplyReach({ ...base, routedUnitsIn: 120 })?.reasons).toEqual(["not_enough"]);
  });

  it("dedupes and sorts source states", () => {
    expect(
      ownSupplyReach({ ...base, sourceStateIds: ["KAN", "HOK", "KAN"] })?.sourceStateIds
    ).toEqual(["HOK", "KAN"]);
  });
});

describe("routesFresh", () => {
  it("never claims a missing haul from a stale haul record", () => {
    expect(ownSupplyReach({ ...base, routesFresh: false })?.reasons).toEqual(["not_enough"]);
  });
});

describe("agreementLeftAGap", () => {
  const gap = {
    volumeCap: 50,
    stateScoped: false,
    buyerStateId: "KYU",
    lastDeliveryTurn: 9,
    lastDeliveredUnits: 10,
    currentTurn: 10,
  };

  it("counts a short delivery on last turn's record", () => {
    expect(agreementLeftAGap(gap)).toBe(true);
  });

  it("does not count an agreement that reserves nothing", () => {
    expect(agreementLeftAGap({ ...gap, volumeCap: 0 })).toBe(false);
  });

  it("does not count a delivery in full", () => {
    expect(agreementLeftAGap({ ...gap, lastDeliveredUnits: 50 })).toBe(false);
  });

  it("does not count a record older than last turn", () => {
    expect(agreementLeftAGap({ ...gap, lastDeliveryTurn: 5 })).toBe(false);
    expect(agreementLeftAGap({ ...gap, lastDeliveryTurn: undefined })).toBe(false);
  });

  it("does not count a state-scoped agreement fulfilled in another state", () => {
    expect(agreementLeftAGap({ ...gap, stateScoped: true, agreementStateId: "KAN" })).toBe(false);
    expect(agreementLeftAGap({ ...gap, stateScoped: true, agreementStateId: "KYU" })).toBe(true);
  });
});

describe("fundedOwnSupplyReach", () => {
  const funded = {
    buyerStateId: "KYU",
    sourceStateIds: ["HOK"],
    output: { made: 12, ownSites: 12, soldOutside: 0 },
    marketFirst: false,
    stateScoped: false,
    hasAgreement: false,
  };

  it("never claims the old policy or freight reasons", () => {
    const r = fundedOwnSupplyReach(funded);
    expect(r?.reasons).not.toContain("market_priority");
    expect(r?.reasons).not.toContain("no_route");
  });

  it("says own output was fully used by other sites, and how much was made", () => {
    expect(fundedOwnSupplyReach(funded)).toEqual({
      sourceStateIds: ["HOK"],
      reasons: ["used_by_own_sites", "made_only"],
      output: { made: 12, ownSites: 12, soldOutside: 0 },
    });
  });

  it("says only how much was made when some went elsewhere", () => {
    expect(
      fundedOwnSupplyReach({ ...funded, output: { made: 12, ownSites: 4, soldOutside: 0 } })
        ?.reasons
    ).toEqual(["made_only"]);
  });

  it("names an explicit open market choice only when outside buyers took some", () => {
    const sold = { made: 12, ownSites: 2, soldOutside: 10 };
    expect(fundedOwnSupplyReach({ ...funded, marketFirst: true, output: sold })?.reasons).toEqual([
      "sold_first",
      "made_only",
    ]);
    expect(fundedOwnSupplyReach({ ...funded, marketFirst: false, output: sold })?.reasons).toEqual([
      "made_only",
    ]);
    expect(fundedOwnSupplyReach({ ...funded, marketFirst: true })?.reasons).toEqual([
      "used_by_own_sites",
      "made_only",
    ]);
  });

  it("keeps a local good made only in other states to its own reason", () => {
    expect(fundedOwnSupplyReach({ ...funded, stateScoped: true })?.reasons).toEqual(["local_only"]);
    expect(
      fundedOwnSupplyReach({ ...funded, stateScoped: true, sourceStateIds: ["KYU"] })?.reasons
    ).toEqual(["used_by_own_sites", "made_only"]);
  });

  it("adds a short agreement and is null with no source", () => {
    expect(fundedOwnSupplyReach({ ...funded, hasAgreement: true })?.reasons).toContain(
      "agreement_reserved"
    );
    expect(fundedOwnSupplyReach({ ...funded, sourceStateIds: [] })).toBeNull();
  });
});
