import { describe, expect, it } from "vitest";
import { householdTransferFunding, publicBuyerFunding } from "./publicBuyerRules";

describe("public buyer funding", () => {
  const PLANT_SHARE = 0.02;
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
        plantShare: PLANT_SHARE,
      },
    ],
    48
  );

  it("funds each turn's slice of the budget that falls inside the plant economy, nothing more", () => {
    const health = (4800 / 48) * PLANT_SHARE;
    const ordnance = (9600 / 48) * PLANT_SHARE;
    expect(us.fundingLocal).toBeCloseTo(health + ordnance, 9);
  });

  it("never buys more than the plant economy's share of the whole budget", () => {
    const wholeBudgetPerTurn = (4800 + 9600) / 48;
    expect(us.fundingLocal).toBeLessThanOrEqual(wholeBudgetPerTurn * PLANT_SHARE + 1e-9);
  });

  it("scales with the plant economy, so a country with ten times the plants buys ten times the goods", () => {
    const fund = (plantShare: number) =>
      publicBuyerFunding(
        [
          {
            countryId: "US",
            byCategory: { healthcare: 4800 },
            plannedEconomy: false,
            stateWeights: new Map([["NY", 1]]),
            plantShare,
          },
        ],
        48
      )[0].fundingLocal;
    expect(fund(0.2) / fund(0.02)).toBeCloseTo(10, 9);
  });

  it("buys a size the plants can make: a national budget no longer outruns one plant by orders of magnitude", () => {
    // A national healthcare budget of 2e12 a year against a plant economy that
    // turns over a few tens of thousands a turn in a 7e11-a-turn economy.
    const gdpPerTurn = 7e11;
    const plantTurnover = 3.2e4;
    const [country] = publicBuyerFunding(
      [
        {
          countryId: "US",
          byCategory: { healthcare: 2e12 },
          plannedEconomy: false,
          stateWeights: new Map([["NY", 1]]),
          plantShare: plantTurnover / gdpPerTurn,
        },
      ],
      48
    );
    expect(country.fundingLocal).toBeLessThan(plantTurnover);
    expect(country.fundingLocal).toBeGreaterThan(plantTurnover / 1000);
  });

  it("spends nothing where the plant economy has no measured share, and caps a share above 1", () => {
    const fund = (plantShare: number) =>
      publicBuyerFunding(
        [
          {
            countryId: "US",
            byCategory: { healthcare: 4800 },
            plannedEconomy: false,
            stateWeights: new Map([["NY", 1]]),
            plantShare,
          },
        ],
        48
      )[0].fundingLocal;
    expect(fund(0)).toBe(0);
    expect(fund(Number.NaN)).toBe(0);
    expect(fund(5)).toBeCloseTo(4800 / 48, 9);
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
      [
        {
          countryId: "X",
          byCategory: {},
          plannedEconomy: false,
          stateWeights: new Map(),
          plantShare: 1,
        },
      ],
      48
    );
    expect(x.fundingLocal).toBe(0);
  });
});

describe("household transfer funding", () => {
  const wallets = [
    { accountId: "w-a", countryId: "US", stateId: "A" },
    { accountId: "w-b", countryId: "US", stateId: "B" },
    { accountId: "w-c", countryId: "GB", stateId: "C" },
  ];

  it("pays the sum of social security, welfare and pensions, not just the first line", () => {
    const out = householdTransferFunding(
      [{ countryId: "GB", byCategory: { socialSecurity: 600, welfare: 360, pensions: 240 } }],
      wallets,
      new Map(),
      new Map([["GB", 1]]),
      12
    );
    expect(out).toEqual([{ walletId: "w-c", countryId: "GB", amount: 100 }]);
  });

  it("shares the social security line across a country's wallets by state weight", () => {
    const out = householdTransferFunding(
      [{ countryId: "US", byCategory: { socialSecurity: 1200, defense: 999 } }],
      wallets,
      new Map([
        [
          "US",
          new Map([
            ["A", 3],
            ["B", 1],
          ]),
        ],
      ]),
      new Map([["US", 1]]),
      12
    );
    expect(out).toEqual([
      { walletId: "w-a", countryId: "US", amount: 75 },
      { walletId: "w-b", countryId: "US", amount: 25 },
    ]);
  });

  it("falls back to an even split without weights and conserves the budgeted amount", () => {
    const out = householdTransferFunding(
      [{ countryId: "US", byCategory: { socialSecurity: 240 } }],
      wallets,
      new Map(),
      new Map([["US", 1]]),
      12
    );
    expect(out.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(20, 12);
    expect(out.map((t) => t.amount)).toEqual([10, 10]);
  });

  it("pays nothing for a country without a transfer line or without wallets", () => {
    expect(
      householdTransferFunding(
        [
          { countryId: "US", byCategory: { defense: 5 } },
          { countryId: "FR", byCategory: { socialSecurity: 100 } },
        ],
        wallets,
        new Map(),
        new Map([
          ["US", 1],
          ["FR", 1],
        ]),
        12
      )
    ).toEqual([]);
  });

  it("scales the line by the plant economy's share of the country's economy", () => {
    const out = householdTransferFunding(
      [{ countryId: "US", byCategory: { socialSecurity: 1200 } }],
      wallets,
      new Map(),
      new Map([["US", 0.01]]),
      12
    );
    expect(out.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(1, 12);
    expect(
      householdTransferFunding(
        [{ countryId: "US", byCategory: { socialSecurity: 1200 } }],
        wallets,
        new Map(),
        new Map(),
        12
      )
    ).toEqual([]);
  });
});
