import { describe, expect, it } from "vitest";
import {
  OPERATING_RESERVE_TURNS,
  operatingReserveCheck,
  operatingReserveMessage,
  operatingReserveSkipReason,
  runningBillsPerTurn,
  type ReserveReceipt,
} from "./operatingReserve";

const receipt = (changes: Partial<ReserveReceipt> = {}): ReserveReceipt => ({
  turn: 10,
  labourPaid: 50,
  labourArrears: 10,
  otherOperatingPaid: 15,
  otherOperatingArrears: 5,
  purchases: 20,
  activeUnits: 100,
  producedUnits: 100,
  plannedRunShare: 1,
  ...changes,
});

describe("operating reserve", () => {
  it("defaults to three turns", () => {
    expect(OPERATING_RESERVE_TURNS).toBe(3);
  });

  it("adds wages, site bills and inputs, paid or owed, across plants", () => {
    expect(runningBillsPerTurn([receipt(), receipt({ purchases: 0 })], 10)).toBe(100 + 80);
  });

  it("reads a cash-cut plant at the run it planned", () => {
    // Cash cut it to 25 of a planned 100: its full run bills four times as much.
    expect(
      runningBillsPerTurn([receipt({ producedUnits: 25, runCutBy: ["cash"] })], 10)
    ).toBeCloseTo(400);
    // An input cut is not scaled: the plant could not run more anyway.
    expect(runningBillsPerTurn([receipt({ producedUnits: 25, runCutBy: ["inputs"] })], 10)).toBe(
      100
    );
    // A plant that made nothing has no run to scale from.
    expect(runningBillsPerTurn([receipt({ producedUnits: 0, runCutBy: ["cash"] })], 10)).toBe(100);
  });

  it("ignores stale and malformed receipts", () => {
    expect(runningBillsPerTurn([receipt({ turn: 5 })], 10)).toBe(0);
    expect(runningBillsPerTurn([receipt({ labourPaid: Number.NaN, purchases: -5 })], 10)).toBe(30);
    expect(runningBillsPerTurn([], 10)).toBe(0);
  });

  it("refuses a build that would leave less than the reserve and names the largest that keeps it", () => {
    const check = operatingReserveCheck({ cash: 1000, cost: 800, billsPerTurn: 100 });
    expect(check).toEqual({ ok: false, reserve: 300, maxAffordable: 700 });
    expect(operatingReserveCheck({ cash: 1000, cost: 700, billsPerTurn: 100 }).ok).toBe(true);
    // Cash already below the reserve: nothing is affordable.
    expect(operatingReserveCheck({ cash: 200, cost: 1, billsPerTurn: 100 })).toEqual({
      ok: false,
      reserve: 300,
      maxAffordable: 0,
    });
  });

  it("keeps no reserve with no running bills or the reserve turned off", () => {
    expect(operatingReserveCheck({ cash: 10, cost: 10, billsPerTurn: 0 }).ok).toBe(true);
    expect(operatingReserveCheck({ cash: 10, cost: 10, billsPerTurn: 100, turns: 0 }).ok).toBe(
      true
    );
  });

  it("refuses the ticket 1766 build: 25.6M ordered from 26.9M with 5.8M a turn of bills", () => {
    // Turn 662 receipts: wages 1.85M, site 0.35M, inputs 3.61M a turn.
    const bills = runningBillsPerTurn(
      [
        receipt({
          turn: 662,
          labourPaid: 1_846_353,
          labourArrears: 0,
          otherOperatingPaid: 348_889,
          otherOperatingArrears: 0,
          purchases: 3_612_238,
        }),
      ],
      662
    );
    const check = operatingReserveCheck({
      cash: 26_900_000,
      cost: 25_600_000,
      billsPerTurn: bills,
    });
    expect(check.ok).toBe(false);
    expect(check.reserve).toBeCloseTo(17_422_440, 0);
    expect(check.maxAffordable).toBeCloseTo(9_477_560, 0);
  });

  it("states the reserve and the largest affordable build", () => {
    const text = operatingReserveMessage({
      costLocal: 800,
      cashLocal: 1000,
      reserveLocal: 300,
      maxAffordableLocal: 700,
      turns: 3,
      currencyCode: "GBP",
    });
    expect(text).toContain("leave £200 in cash");
    expect(text).toContain("the £300 your plants need to run for 3 turns");
    expect(text).toContain("most you can build and keep that reserve is £700");
    expect(text).not.toMatch(/[–—]/);
    expect(operatingReserveSkipReason(3)).toBe(
      "Would leave less than 3 turns of running costs in cash"
    );
  });
});
