import { describe, expect, it } from "vitest";
import {
  GOVERNMENT_GOODS_MIXES,
  governmentBudgetLinesText,
  governmentBuysCommodity,
} from "./governmentCommodityDemand";
import { publicBuyerFunding } from "./producerMarket/publicBuyerRules";

describe("government goods mixes", () => {
  it("each budget line's weights sum to one (administration is within rounding of it)", () => {
    for (const line of GOVERNMENT_GOODS_MIXES) {
      const sum = Object.values(line.mix).reduce((s, w) => s + (w ?? 0), 0);
      expect(sum, line.category).toBeGreaterThan(0.97);
      expect(sum, line.category).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("names the budget lines that buy a good", () => {
    expect(governmentBudgetLinesText("electronics")).toContain("Healthcare 10%");
    expect(governmentBudgetLinesText("electronics")).toContain("Defense 3%");
    expect(governmentBuysCommodity("steel")).toBe(true);
  });
});

describe("public buyer funding with mixes", () => {
  const budget = (byCategory: Record<string, number>) => ({
    countryId: "US",
    byCategory,
    plannedEconomy: false,
    stateWeights: new Map([
      ["NY", 3],
      ["CA", 1],
    ]),
    plantShare: 0.5,
  });
  const [us] = publicBuyerFunding(
    [budget({ healthcare: 4800, defense: 9600, infrastructure: 2400, other: 4800 })],
    48
  );

  it("spends each category's whole plant-slice money, split over its goods", () => {
    const perTurn = (4800 + 9600 + 2400) / 48 / 2 + (4800 * 0.25) / 48 / 2;
    expect(us.fundingLocal).toBeCloseTo(perTurn, 9);
  });

  it("shifts the mix when a government spends more on a line", () => {
    const steel = (infra: number) =>
      publicBuyerFunding([budget({ infrastructure: infra, defense: 960 })], 48)[0].lines.find(
        (l) => l.commodity === "steel"
      )!.amountLocal;
    expect(steel(9600)).toBeGreaterThan(steel(960) * 5);
  });

  it("merges two budget lines buying the same good into one order line, and keeps the split", () => {
    const electronics = us.lines.filter((l) => l.commodity === "electronics");
    expect(electronics).toHaveLength(1);
    const parts = us.byBudgetLine.filter((l) => l.commodity === "electronics");
    expect(parts.map((p) => p.category).sort()).toEqual(["defense", "healthcare"]);
    expect(parts.reduce((s, p) => s + p.amountLocal, 0)).toBeCloseTo(electronics[0].amountLocal, 9);
  });

  it("splits state-scoped goods across states by weight", () => {
    const ny = us.lines.find(
      (l) => l.commodity === "healthcare_services" && l.book === "state:NY"
    )!;
    const ca = us.lines.find(
      (l) => l.commodity === "healthcare_services" && l.book === "state:CA"
    )!;
    expect(ny.amountLocal / ca.amountLocal).toBeCloseTo(3, 9);
  });

  it("reads a UK transport budget as infrastructure", () => {
    const [uk] = publicBuyerFunding([budget({ transport: 4800 })], 48);
    expect(uk.lines.some((l) => l.commodity === "steel")).toBe(true);
  });
});
