import { describe, expect, it } from "vitest";
import { BSON } from "mongodb";
import { regionalOpeningServiceClaims } from "./regionalServiceClaims";
import type { ResetRegionalOpeningBoard } from "./regionalOpeningBoard";
import { settleRegionalBudget } from "@/lib/governmentFinance/rules/regionalSettlement";
import { transferResetV2FiscalToIreland } from "@/lib/referendum/transfer/rules/resetV2Transfer";

const board: ResetRegionalOpeningBoard = {
  _id: "US:CA",
  countryId: "US",
  regionId: "CA",
  worldId: "world",
  sourceTurn: 1,
  annualSpending: 100,
  familyOwned: 0,
  otherExistingServices: 100,
  allocatedClaims: [],
  estimateKind: "proportional-source-pool",
  existingServicesByCategory: { education: 60, healthcare: 40 },
};
describe("regional opening service continuity", () => {
  it("preserves service-category units across an existing currency transfer", () => {
    const transferred = transferResetV2FiscalToIreland(board, "CA", 2);
    expect(
      regionalOpeningServiceClaims(transferred).reduce((sum, c) => sum + c.authorizedCost, 0)
    ).toBe(200);
  });
  it("retains the same frozen claims across fiscal years and a BSON round trip", () => {
    const claims = regionalOpeningServiceClaims(board);
    expect(claims.map((c) => [c.category, c.authorizedCost])).toEqual([
      ["education", 60],
      ["healthcare", 40],
    ]);
    expect(
      regionalOpeningServiceClaims(
        BSON.deserialize(BSON.serialize(board)) as ResetRegionalOpeningBoard
      )
    ).toEqual(claims);
    for (let year = 0; year < 3; year++)
      expect(settleRegionalBudget({ availableBudget: 100, claims }).totalFunded).toBe(100);
  });
  it("does not double book existing services when a separate regional program is enacted", () => {
    const claims = [
      ...regionalOpeningServiceClaims(board),
      {
        programId: "new-transit",
        legislationTypeId: "L08",
        policyOptionId: "local_program",
        authorizedCost: 20,
        obligationPriority: 5,
        fundingSemantics: "appropriation_included" as const,
        continuing: false,
      },
    ];
    const funded = settleRegionalBudget({ availableBudget: 120, claims });
    expect(funded.totalAuthorized).toBe(120);
    expect(funded.totalFunded).toBe(120);
    const tight = settleRegionalBudget({ availableBudget: 100, claims });
    expect(tight.programs.find((p) => p.programId === "new-transit")?.fundedAmount).toBe(0);
    expect(tight.totalFunded).toBe(100);
    expect(settleRegionalBudget({ availableBudget: 0, claims }).totalFunded).toBe(0);
  });
  it("rejects missing or mismatched baselines instead of erasing services", () => {
    expect(() =>
      regionalOpeningServiceClaims({ ...board, existingServicesByCategory: undefined })
    ).toThrow("Missing frozen");
    expect(() =>
      regionalOpeningServiceClaims({ ...board, existingServicesByCategory: { education: 101 } })
    ).toThrow("reconcile");
  });
});
