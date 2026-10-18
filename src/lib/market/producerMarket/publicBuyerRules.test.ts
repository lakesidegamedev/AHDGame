import { describe, expect, it } from "vitest";
import { publicBuyerFunding } from "./publicBuyerRules";
import {
  GOVT_HEALTHCARE_DEMAND_RATE,
  GOVT_DEFENSE_ORDNANCE_DEMAND_RATE,
} from "@/lib/constants/commodities";

describe("public buyer funding", () => {
  const [us] = publicBuyerFunding(
    [
      {
        countryId: "US",
        byCategory: { healthcare: 4800, defense: 9600 },
        plannedEconomy: false,
        stateWeights: new Map([
          ["NY", 3],
          ["CA", 1],
        ]),
      },
    ],
    48
  );

  it("funds goods from each turn's slice of the existing budget, nothing more", () => {
    const health = (4800 / 48) * GOVT_HEALTHCARE_DEMAND_RATE;
    const ordnance = (9600 / 48) * GOVT_DEFENSE_ORDNANCE_DEMAND_RATE;
    expect(us.fundingLocal).toBeCloseTo(health + ordnance, 9);
  });

  it("buys local services in each state by weight, goods on the world book", () => {
    const h = us.lines.filter((l) => l.commodity === "healthcare_services");
    expect(h.map((l) => l.book).sort()).toEqual(["state:CA", "state:NY"]);
    const ny = h.find((l) => l.book === "state:NY")!.amountLocal;
    const ca = h.find((l) => l.book === "state:CA")!.amountLocal;
    expect(ny / ca).toBeCloseTo(3, 9);
    expect(us.lines.find((l) => l.commodity === "ordnance")!.book).toBe("world");
  });

  it("spends nothing on a budget with no goods lines", () => {
    const [x] = publicBuyerFunding(
      [{ countryId: "X", byCategory: {}, plannedEconomy: false, stateWeights: new Map() }],
      48
    );
    expect(x.fundingLocal).toBe(0);
  });
});
