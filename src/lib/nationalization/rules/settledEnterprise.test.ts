import { describe, expect, it } from "vitest";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import {
  publicServiceWeight,
  fundedDailyToTurn,
  publicServiceShare,
  publicServiceTotals,
} from "./settledEnterprise";
import { estimateNationalizedOperatingIncome } from "@/lib/budget/publicEnterpriseRevenue";
import { cappedRemittanceLocal } from "../ceoFinance";

describe("settled public enterprise income", () => {
  const pnl: NonNullable<CorporateSector["plantsPnl"]> = {
    source: "funded",
    profit: 240,
    revenue: 240,
    inventoryRevenue: 0,
    inventoryCarry: 0,
    inputs: 0,
    labour: 0,
    upkeep: 0,
    compliance: 0,
    otherOpex: 0,
    financialLegs: 0,
    policyCredit: 0,
    policyPp: 0,
    operatingCost: 0,
    totalCost: 0,
    turn: 7,
  };
  const receipt = { worldEpoch: "world", turn: 7, revenue: 10, profit: -1 };
  const sector = {
    stateId: "TX",
    sectorType: "energy",
    countryId: "US",
    revenue: 2400,
    profitMargin: 50,
    currentGrowthCost: 0,
    producerSettlement: receipt,
  } as CorporateSector;
  const corp = {
    countryId: "US",
    countryOwnerId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 10000,
  } as Corporation;
  it("never turns a settled loss into a positive nameplate remittance", () => {
    const income = estimateNationalizedOperatingIncome(
      corp,
      [sector],
      new Map([["USD", 1]]),
      new Map(),
      1,
      true,
      { currentTurn: 7, rampTurns: 1 }
    );
    expect(income).toBe(-1);
    expect(cappedRemittanceLocal(income, 0, 10000)).toBe(0);
  });
  it("uses per-turn receipts across currencies and does not multiply a day's profit", () => {
    const positive = { ...sector, plantsPnl: pnl } as CorporateSector;
    expect(
      estimateNationalizedOperatingIncome(
        corp,
        [positive],
        new Map([["USD", 1]]),
        new Map(),
        1,
        true
      )
    ).toBe(10);
    expect(fundedDailyToTurn(positive, 240)).toBe(10);
    const cad = {
      ...positive,
      countryId: "CA",
      stateId: "CA_ON",

      plantsPnl: { ...pnl, profit: 480 },
    } as CorporateSector;
    expect(
      estimateNationalizedOperatingIncome(
        { ...corp, countryId: "CA", liquidCurrencyCode: "CAD" },
        [cad],
        new Map([
          ["USD", 1],
          ["CAD", 2],
        ]),
        new Map(),
        1,
        true
      )
    ).toBe(10);
  });
  it("treats the first untraded funded turn and stale receipts as zero", () => {
    const empty = {
      ...sector,
      producerSettlement: undefined,
      producerInventory: { worldEpoch: "world", turn: 7, inputStock: [], outputStock: [] },
    };
    expect(
      estimateNationalizedOperatingIncome(corp, [empty], new Map([["USD", 1]]), new Map(), 1, true)
    ).toBe(0);
    expect(
      estimateNationalizedOperatingIncome(
        corp,
        [sector],
        new Map([["USD", 1]]),
        new Map(),
        1,
        true,
        { currentTurn: 9, rampTurns: 1 }
      )
    ).toBe(0);
  });
  it("awards no delivery benefit to cold or unfunded-output holdings", () => {
    expect(publicServiceWeight({ ...sector, mothballed: true })).toBe(0);
    expect(
      publicServiceWeight({
        ...sector,
        producerSettlement: { ...sector.producerSettlement!, revenue: 0 },
      })
    ).toBe(0);
    expect(publicServiceWeight(sector)).toBe(10);
  });
  it("counts competing private output while isolating countries and cold sites", () => {
    const privateSite = {
      ...sector,
      producerSettlement: { ...sector.producerSettlement!, revenue: 30 },
    };
    const foreign = {
      ...privateSite,
      countryId: "CA" as const,
      producerSettlement: { ...sector.producerSettlement!, revenue: 1000 },
    };
    const cold = { ...privateSite, mothballed: true };
    const totals = publicServiceTotals([sector, privateSite, foreign, cold]);
    expect(publicServiceShare(sector, totals)).toBe(0.25);
    expect(publicServiceShare(privateSite, totals)).toBe(0.75);
    expect(publicServiceShare(cold, totals)).toBe(0);
    expect(publicServiceShare(foreign, totals)).toBe(1);
  });
});
