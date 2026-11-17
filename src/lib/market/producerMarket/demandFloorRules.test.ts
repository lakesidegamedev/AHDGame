import { describe, expect, it } from "vitest";
import {
  DEMAND_FLOOR_SHARE_BY_STAGE,
  demandFloorShare,
  flooredPlantShare,
} from "./demandFloorRules";
import { householdTransferFunding, publicBuyerFunding } from "./publicBuyerRules";
import { publicFundingMoves, householdTransferMoves } from "./liveFundingRules";

const budget = {
  healthcare: 4_800,
  defense: 2_400,
  socialSecurity: 960,
  welfare: 480,
};
const weights = new Map([
  ["A", 3],
  ["B", 1],
]);

describe("demand floor share", () => {
  it("is off at stage 0, absent or invalid", () => {
    expect(demandFloorShare(undefined)).toBe(0);
    expect(demandFloorShare(0)).toBe(0);
    expect(demandFloorShare(Number.NaN)).toBe(0);
    expect(flooredPlantShare(0.001, 0)).toBe(0.001);
    expect(flooredPlantShare(0, undefined)).toBe(0);
  });

  it("rises with each stage and holds at the top stage", () => {
    const shares = [1, 2, 3].map((s) => demandFloorShare(s));
    expect(shares[0]).toBeGreaterThan(0);
    expect(shares[1]).toBeGreaterThan(shares[0]);
    expect(shares[2]).toBeGreaterThan(shares[1]);
    expect(demandFloorShare(99)).toBe(DEMAND_FLOOR_SHARE_BY_STAGE.at(-1));
  });

  it("lifts a young world to the floor and leaves a mature world unchanged", () => {
    const floor = demandFloorShare(1);
    expect(flooredPlantShare(0, 1)).toBe(floor);
    expect(flooredPlantShare(floor / 100, 1)).toBe(floor);
    expect(flooredPlantShare(floor * 50, 1)).toBe(floor * 50);
    expect(flooredPlantShare(0.015, 3)).toBe(0.015);
  });

  it("never exceeds the whole budget line", () => {
    expect(flooredPlantShare(5, 1)).toBe(1);
    expect(flooredPlantShare(Number.NaN, 1)).toBe(demandFloorShare(1));
  });
});

describe("demand floor funding stays inside the budget outlay", () => {
  const funded = (plantShare: number) =>
    publicBuyerFunding(
      [
        {
          countryId: "US",
          byCategory: budget,
          plannedEconomy: false,
          stateWeights: weights,
          plantShare,
        },
      ],
      48
    )[0];

  it("a young world buys real health and ordnance from the floor, not nothing", () => {
    expect(funded(0).fundingLocal).toBe(0);
    const floored = funded(flooredPlantShare(0, 1));
    expect(floored.fundingLocal).toBeGreaterThan(0);
    expect(floored.lines.some((l) => l.commodity === "healthcare_services")).toBe(true);
  });

  it("public funding is never more than the share of the line the treasury spends", () => {
    for (const stage of [1, 2, 3]) {
      const share = flooredPlantShare(0, stage);
      const f = funded(share);
      expect(f.fundingLocal).toBeCloseTo(((budget.healthcare + budget.defense) / 48) * share, 9);
      expect(f.fundingLocal).toBeLessThanOrEqual((budget.healthcare + budget.defense) / 48);
    }
  });

  it("a mature world's funding is the measured share, unchanged by the stage", () => {
    expect(funded(flooredPlantShare(0.02, 3)).fundingLocal).toBe(funded(0.02).fundingLocal);
  });

  it("household transfers are the transfer lines times the floored share, no more", () => {
    const share = flooredPlantShare(0, 2);
    const transfers = householdTransferFunding(
      [{ countryId: "US", byCategory: budget }],
      [
        { accountId: "wA", countryId: "US", stateId: "A" },
        { accountId: "wB", countryId: "US", stateId: "B" },
      ],
      new Map([["US", weights]]),
      new Map([["US", share]]),
      48
    );
    const total = transfers.reduce((s, t) => s + t.amount, 0);
    expect(total).toBeCloseTo(((budget.socialSecurity + budget.welfare) / 48) * share, 9);
    expect(transfers.find((t) => t.walletId === "wA")!.amount).toBeCloseTo(total * 0.75, 9);
  });

  it("every floor move is a mint matched by a credit of the same size (ledger conserves)", () => {
    const share = flooredPlantShare(0, 1);
    const f = funded(share);
    const moves = [
      ...publicFundingMoves("w", 3, [
        {
          countryId: "US",
          walletId: "public:US",
          amountLocal: f.fundingLocal,
          currencyCode: "USD",
          localPerAnchor: 1,
        },
      ]),
      ...householdTransferMoves("w", 3, [
        { walletId: "wA", amountLocal: 12, currencyCode: "USD", localPerAnchor: 1 },
      ]),
    ];
    expect(moves.length).toBe(2);
    for (const move of moves) {
      const minted = move.legs.filter((l) => l.kind === "mint").reduce((s, l) => s + l.amount, 0);
      const credited = move.legs
        .filter((l) => l.kind === "credit")
        .reduce((s, l) => s + l.amount, 0);
      expect(credited).toBeCloseTo(minted, 12);
    }
  });
});
