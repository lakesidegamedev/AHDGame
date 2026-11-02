import { describe, expect, it } from "vitest";
import { ownSupplyReach } from "./ownSupplyReach";

const base = {
  priority: "own" as const,
  buyerStateId: "KYU",
  sourceStateIds: ["HOK"],
  crossesStatesByFreight: true,
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
