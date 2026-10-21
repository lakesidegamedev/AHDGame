import { describe, expect, it } from "vitest";
import { heldShares, incomeFloorShares } from "./householdSourceRules";

describe("held share", () => {
  it("never falls below the opening share", () => {
    const held = heldShares(
      new Map([
        ["US", 0.002],
        ["UK", 0.05],
      ]),
      new Map([
        ["US", 0.02],
        ["UK", 0.01],
        ["JP", 0.03],
      ])
    );
    expect(held.get("US")).toBe(0.02);
    expect(held.get("UK")).toBe(0.05);
    expect(held.get("JP")).toBe(0.03);
  });

  it("is the current share when there is no opening record", () => {
    expect(heldShares(new Map([["US", 0.01]]), undefined).get("US")).toBe(0.01);
  });
});

describe("household income floor", () => {
  const lines = new Map([
    ["US", 1000],
    ["UK", 300],
  ]);

  it("does nothing when planned income already meets the floor or the floor is off", () => {
    const shares = new Map([
      ["US", 0.1],
      ["UK", 0.1],
    ]);
    expect(
      incomeFloorShares({
        shares,
        lineAnchorByCountry: lines,
        plannedIncomeAnchor: 500,
        floorAnchor: 100,
      }).topUpAnchor
    ).toBe(0);
    expect(
      incomeFloorShares({
        shares,
        lineAnchorByCountry: lines,
        plannedIncomeAnchor: 0,
        floorAnchor: 0,
      }).topUpAnchor
    ).toBe(0);
  });

  it("raises every share by the same increment to close the gap, and reports the top-up", () => {
    const shares = new Map([
      ["US", 0.01],
      ["UK", 0.01],
    ]); // transfers 13
    const r = incomeFloorShares({
      shares,
      lineAnchorByCountry: lines,
      plannedIncomeAnchor: 20,
      floorAnchor: 100,
    });
    // gap = 100 - (20 + 13) = 67 spread over 1300 of line = 0.0515 each
    expect(r.shares.get("US")).toBeCloseTo(0.01 + 67 / 1300, 12);
    expect(r.shares.get("UK")).toBeCloseTo(0.01 + 67 / 1300, 12);
    expect(r.topUpAnchor).toBeCloseTo(67, 9);
  });

  it("never pays more than a country's whole transfer line, and redistributes a capped share", () => {
    const r = incomeFloorShares({
      shares: new Map([
        ["US", 0.99],
        ["UK", 0],
      ]),
      lineAnchorByCountry: lines,
      plannedIncomeAnchor: 0,
      floorAnchor: 10_000,
    });
    expect(r.shares.get("US")).toBe(1);
    expect(r.shares.get("UK")).toBe(1);
    expect(r.topUpAnchor).toBeCloseTo(1000 * 0.01 + 300, 9);
    // The whole lines (1300) minus the 990 already paid cannot reach 10,000: the rest is reported.
    expect(r.shortfallAnchor).toBeCloseTo(10_000 - (990 + 310), 9);
  });

  it("gives a country below its line the part a capped country could not absorb", () => {
    const r = incomeFloorShares({
      shares: new Map([
        ["US", 0.95],
        ["UK", 0],
      ]),
      lineAnchorByCountry: new Map([
        ["US", 1000],
        ["UK", 1000],
      ]),
      plannedIncomeAnchor: 0,
      floorAnchor: 1200, // transfers 950; gap 250; an equal split would push US past 1
    });
    expect(r.shares.get("US")).toBe(1);
    expect(r.topUpAnchor).toBeCloseTo(250, 9);
    expect(r.shortfallAnchor).toBe(0);
    expect(r.shares.get("UK")).toBeCloseTo(0.2, 9); // 200 more from UK after US takes its 50
  });
});
