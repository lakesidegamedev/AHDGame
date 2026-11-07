import { createHash } from "node:crypto";
import { producerPayableId } from "./payablesRules";
import { producerTrades } from "./rules";
import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { demandPlanRunShare, OUTPUT_CUT_STEP } from "./outputResponseRules";
import { MINOR_INPUT_SHORTFALL_PREMIUM } from "./makeDoRules";
import { fundedInputThroughput, fundedSectorOpsAll, type FundedReceipt } from "./fundedSectorRules";
import { decisionProfit } from "./internalTransferPricingRules";
import { strugglingReason } from "./transitionRules";

const plant = (changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id: "plant",
  accountId: "corp",
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [{ commodity: "energy", unitsPerOutput: 2, book: "world", maximumUnitPrice: 1 }],
  outputs: [
    {
      commodity: "financial_services",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 3 },
      referenceUnitPrice: 3,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
  ...changes,
});
const accounts = [
  { id: "corp", cash: 1000 },
  { id: "households", cash: 1000 },
  { id: "services", cash: 0 },
  { id: "supplier", cash: 0 },
];

describe("internal supply accounting", () => {
  it("does not allocate site income for a company purchase outside the plant accounts", () => {
    const producer = plant({
      id: "energy",
      inputs: [],
      outputs: [
        {
          commodity: "energy",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 10 },
          referenceUnitPrice: 10,
          storable: true,
        },
      ],
      internalTransferPricing: { mode: "cost" },
    });
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [producer],
      externalOrders: [
        {
          id: "other-company-spend",
          accountId: "corp",
          commodity: "energy",
          book: "world",
          units: 10,
          maximumUnitPrice: 10,
        },
      ],
    });
    expect(result.producers[0].internalSupplyIncome).toBeUndefined();
    expect(result.producers[0].internalSupplyCharge).toBeUndefined();
    expect(result.producers[0].profit).toBe(-30);
  });
  it.each(["cost", "market"] as const)(
    "balances %s allocations without changing cash or physical output",
    (mode) => {
      const producer = plant({
        id: "energy",
        inputs: [],
        outputs: [
          {
            commodity: "energy",
            book: "world",
            unitsPerOutput: 2,
            policy: { kind: "manual", unitPrice: 10 },
            referenceUnitPrice: 10,
            storable: true,
          },
        ],
      });
      const consumer = plant({ id: "consumer" });
      const request = { turn: 1, accounts, producers: [producer, consumer], externalOrders: [] };
      const free = advanceProducerEconomy(request);
      const priced = advanceProducerEconomy({
        ...request,
        producers: [{ ...producer, internalTransferPricing: { mode, discount: 0.2 } }, consumer],
      });
      expect(priced.accounts).toEqual(free.accounts);
      expect(
        priced.producers.map((p) => [p.id, p.producedUnits, p.deliveredUnits, p.cashFlow, p.profit])
      ).toEqual(
        free.producers.map((p) => [p.id, p.producedUnits, p.deliveredUnits, p.cashFlow, p.profit])
      );
      const income = priced.producers.reduce((n, p) => n + (p.internalSupplyIncome ?? 0), 0);
      const charge = priced.producers.reduce((n, p) => n + (p.internalSupplyCharge ?? 0), 0);
      expect(income).toBeGreaterThan(0);
      expect(income).toBeCloseTo(charge, 8);
      expect(priced.producers.reduce((n, p) => n + p.profit, 0)).toBeCloseTo(
        free.producers.reduce((n, p) => n + p.profit, 0),
        8
      );
      expect(priced.producers.find((p) => p.id === "energy")!.profit).toBeCloseTo(
        free.producers.find((p) => p.id === "energy")!.profit,
        8
      );
    }
  );
});

describe("internal supply legs net across a multi-site company", () => {
  const output = (commodity: string, unitPrice: number) => ({
    commodity,
    book: "world",
    unitsPerOutput: 1,
    policy: { kind: "manual" as const, unitPrice },
    referenceUnitPrice: unitPrice,
    storable: true,
  });
  const input = (commodity: string, unitsPerOutput: number) => ({
    commodity,
    unitsPerOutput,
    book: "world",
    maximumUnitPrice: 50,
  });
  const site = (
    id: string,
    inputs: ProductionPlan["inputs"],
    outputs: ProductionPlan["outputs"]
  ): ProductionPlan =>
    plant({ id, inputs, outputs, internalTransferPricing: { mode: "market", discount: 0 } });
  const request = {
    turn: 1,
    accounts: [
      { id: "corp", cash: 100000 },
      { id: "households", cash: 1000 },
      { id: "services", cash: 0 },
      { id: "supplier", cash: 0 },
    ],
    producers: [
      site("a", [], [output("energy", 5)]),
      site("b", [input("energy", 1)], [output("steel", 10)]),
      site("c", [input("steel", 1), input("energy", 1)], [output("pharma", 20)]),
      site("d", [input("pharma", 1)], [output("health", 30)]),
    ],
    externalOffers: [
      {
        id: "o",
        accountId: "supplier",
        commodity: "energy",
        book: "world",
        units: 30,
        unitPrice: 4,
      },
    ],
    externalOrders: ["pharma", "health"].map((commodity) => ({
      id: `town-${commodity}`,
      accountId: "households",
      commodity,
      book: "world",
      units: 20,
      maximumUnitPrice: 40,
    })),
  };

  it.each([false, true])(
    "books equal income and charge over a multi-hop chain (captive stage %s)",
    (captiveMarketValue) => {
      const result = advanceProducerEconomy({ ...request, captiveMarketValue });
      const income = result.producers.reduce((n, p) => n + (p.internalSupplyIncome ?? 0), 0);
      const charge = result.producers.reduce((n, p) => n + (p.internalSupplyCharge ?? 0), 0);
      expect(income).toBeGreaterThan(0);
      expect(income).toBeCloseTo(charge, 8);
    }
  );

  it("still nets after each site's legs are restated in its own currency", () => {
    const result = advanceProducerEconomy(request);
    // Sellers at home in dollars, receivers in a currency worth 1/120 of the anchor.
    const rate = new Map([
      ["a", 1],
      ["b", 1],
      ["c", 120],
      ["d", 120],
    ]);
    const ops = result.producers.map((p) => ({
      updateOne: { filter: { _id: p.id }, update: { $set: { name: p.id } } },
    }));
    const funded = new Map(
      result.producers.map((p) => [
        p.id,
        {
          receipt: p as unknown as FundedReceipt,
          result: { hourlyRevenue: 0, costs: 0, effectiveMargin: 0, hourlyGrowthCost: 0 },
          daily: (anchor: number) => anchor * rate.get(p.id)!,
        },
      ])
    );
    const written = fundedSectorOpsAll(ops, funded, 1);
    let income = 0;
    let charge = 0;
    for (const op of written) {
      const id = String((op.updateOne.filter as { _id: string })._id);
      const pnl = (op.updateOne.update as { $set: { plantsPnl: Record<string, number> } }).$set
        .plantsPnl;
      income += (pnl.internalSupplyIncome ?? 0) / rate.get(id)!;
      charge += (pnl.internalSupplyCharge ?? 0) / rate.get(id)!;
    }
    expect(income).toBeGreaterThan(0);
    expect(income).toBeCloseTo(charge, 6);
  });
});

describe("own-site deliveries at market value (captive stage 3)", () => {
  const mine = plant({
    id: "mine",
    inputs: [],
    outputs: [
      {
        commodity: "energy",
        book: "world",
        unitsPerOutput: 2,
        policy: { kind: "manual", unitPrice: 10 },
        referenceUnitPrice: 10,
        storable: true,
      },
    ],
  });
  const consumer = plant({ id: "consumer" });
  const optedIn = (p: typeof mine) => ({ ...p, ownSiteMarketValue: true });
  const request = {
    turn: 1,
    accounts,
    producers: [optedIn(mine), optedIn(consumer)],
    // An outside seller clears the lane at 8 while the mine asks 10.
    externalOffers: [
      {
        id: "outside",
        accountId: "supplier",
        commodity: "energy",
        book: "world",
        units: 50,
        unitPrice: 8,
      },
    ],
    externalOrders: [
      {
        id: "town",
        accountId: "households",
        commodity: "energy",
        book: "world",
        units: 50,
        maximumUnitPrice: 9,
      },
    ],
  };
  const byId = (r: ReturnType<typeof advanceProducerEconomy>, id: string) =>
    r.producers.find((p) => p.id === id)!;

  it("credits the producing site at the clearing price and charges the receiving site the same", () => {
    const result = advanceProducerEconomy({
      ...request,
      captiveShortValue: true,
      captiveMarketValue: true,
    });
    const product = byId(result, "mine").products[0];
    expect(product.internalDeliveredUnits).toBeGreaterThan(0);
    expect(product.soldUnits).toBe(0);
    expect(product.captiveUnitValue).toBeCloseTo(8);
    expect(byId(result, "mine").internalSupplyIncome).toBeCloseTo(
      product.internalDeliveredUnits * 8,
      8
    );
    expect(byId(result, "consumer").internalSupplyCharge).toBeCloseTo(
      product.internalDeliveredUnits * 8,
      8
    );
  });

  it("falls back to the site's ask when the lane did not trade", () => {
    const result = advanceProducerEconomy({
      ...request,
      externalOffers: [],
      externalOrders: [],
      captiveMarketValue: true,
    });
    const product = byId(result, "mine").products[0];
    expect(product.internalDeliveredUnits).toBeGreaterThan(0);
    expect(product.captiveUnitValue).toBeCloseTo(10);
    expect(byId(result, "mine").internalSupplyIncome).toBeCloseTo(
      byId(result, "consumer").internalSupplyCharge!,
      8
    );
  });

  it("leaves company cash, profit and physical flows as at stage 2", () => {
    const stage2 = advanceProducerEconomy({ ...request, captiveShortValue: true });
    const stage3 = advanceProducerEconomy({
      ...request,
      captiveShortValue: true,
      captiveMarketValue: true,
    });
    expect(stage3.accounts).toEqual(stage2.accounts);
    const flows = (r: typeof stage2) =>
      r.producers.map((p) => [p.id, p.producedUnits, p.deliveredUnits, p.cashFlow, p.profit]);
    expect(flows(stage3)).toEqual(flows(stage2));
    const income = stage3.producers.reduce((n, p) => n + (p.internalSupplyIncome ?? 0), 0);
    const charge = stage3.producers.reduce((n, p) => n + (p.internalSupplyCharge ?? 0), 0);
    expect(income).toBeGreaterThan(0);
    expect(income).toBeCloseTo(charge, 8);
  });

  it("books nothing at stage 2 or below", () => {
    for (const flags of [{}, { captiveShortValue: true }]) {
      const result = advanceProducerEconomy({ ...request, ...flags });
      for (const p of result.producers) {
        expect(p.internalSupplyIncome).toBeUndefined();
        expect(p.internalSupplyCharge).toBeUndefined();
      }
      expect(byId(result, "mine").products[0].captiveUnitValue).toBeUndefined();
    }
  });

  it("judges a captive-only seller on its management account at stage 3 only", () => {
    const stage2 = advanceProducerEconomy({ ...request, captiveShortValue: true });
    const stage3 = advanceProducerEconomy({
      ...request,
      captiveShortValue: true,
      captiveMarketValue: true,
    });
    const seller = byId(stage3, "mine");
    // Everything went to its own company: no sale, an economic loss.
    expect(seller.soldUnits).toBe(0);
    expect(seller.profit).toBeLessThan(0);
    expect(decisionProfit(seller, true)).toBeGreaterThan(0);
    expect(strugglingReason(seller, true)).toBeNull();
    // The receiving site carries the matching charge.
    const receiver = byId(stage3, "consumer");
    expect(decisionProfit(receiver, true)).toBeCloseTo(
      receiver.profit - receiver.internalSupplyCharge!,
      8
    );
    // Stage 2 books no entries, so decisions read the economic loss as before.
    const before = byId(stage2, "mine");
    expect(decisionProfit(before, false)).toBe(before.profit);
    expect(strugglingReason(before, false)).toBe("zeroSales");
    // Company totals: the entries net to zero, cash is untouched.
    const sum = (r: typeof stage3, f: (p: (typeof r.producers)[number]) => number) =>
      r.producers.reduce((n, p) => n + f(p), 0);
    expect(sum(stage3, (p) => decisionProfit(p, true))).toBeCloseTo(
      sum(stage3, (p) => p.profit),
      8
    );
    expect(stage3.accounts).toEqual(stage2.accounts);
  });

  it("books no entries for a company on Free transfer pricing", () => {
    const free = advanceProducerEconomy({
      ...request,
      producers: [mine, consumer],
      captiveShortValue: true,
      captiveMarketValue: true,
    });
    for (const p of free.producers) {
      expect(p.internalSupplyIncome).toBeUndefined();
      expect(p.internalSupplyCharge).toBeUndefined();
    }
    expect(byId(free, "mine").products[0].captiveUnitValue).toBeUndefined();
  });

  it("keeps an explicit internal transfer price instead of adding a second entry", () => {
    const priced = optedIn({ ...mine, internalTransferPricing: { mode: "cost" as const } });
    const base = advanceProducerEconomy({
      ...request,
      producers: [priced, optedIn(consumer)],
    });
    const stage3 = advanceProducerEconomy({
      ...request,
      producers: [priced, optedIn(consumer)],
      captiveMarketValue: true,
    });
    expect(byId(stage3, "mine").internalSupplyIncome).toBe(byId(base, "mine").internalSupplyIncome);
    expect(byId(stage3, "consumer").internalSupplyCharge).toBe(
      byId(base, "consumer").internalSupplyCharge
    );
  });
});

describe("receipt-backed production", () => {
  it("sells retained goods after a recipe change without producing or expensing them again", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      carryLossByCommodity: { steel: 0 },
      producers: [
        plant({
          capacityUnits: 0,
          labourCost: 0,
          otherOperatingCost: 0,
          outputs: [
            {
              commodity: "steel",
              book: "world",
              unitsPerOutput: 0,
              referenceUnitPrice: 9,
              retainedUnitCost: 2,
              policy: { kind: "costPlus", markup: 0.5 },
              storable: true,
            },
          ],
          outputStock: [{ commodity: "steel", book: "world", units: 5, quoteUnitCost: 2 }],
        }),
      ],
      externalOrders: [
        {
          id: "customer",
          accountId: "households",
          commodity: "steel",
          book: "world",
          units: 3,
          maximumUnitPrice: 3,
        },
      ],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 0,
      revenue: 9,
      inputsConsumed: 0,
      profit: 9,
      outputStock: [{ commodity: "steel", book: "world", units: 2, quoteUnitCost: 2 }],
    });
    expect(result.producers[0].products[0]).toMatchObject({
      producedUnits: 0,
      deliveredUnits: 3,
      askingUnitPrice: 3,
    });
    expect(result.accounts.find((account) => account.id === "corp")?.cash).toBe(1009);
    expect(result.accounts.find((account) => account.id === "households")?.cash).toBe(991);
  });

  it("does not invent a retained unit cost for cost-plus pricing", () => {
    const producer = plant({
      capacityUnits: 0,
      outputs: [
        {
          commodity: "steel",
          book: "world",
          unitsPerOutput: 0,
          referenceUnitPrice: 9,
          policy: { kind: "costPlus", markup: 0.5 },
          storable: true,
        },
      ],
      outputStock: [{ commodity: "steel", book: "world", units: 5 }],
    });
    expect(() => advanceProducerEconomy({ turn: 1, accounts, producers: [producer] })).toThrow(
      "recorded unit cost"
    );
    const manual = {
      ...producer,
      outputs: producer.outputs.map((output) => ({
        ...output,
        policy: { kind: "manual" as const, unitPrice: 3 },
      })),
    };
    expect(
      advanceProducerEconomy({ turn: 1, accounts, producers: [manual] }).producers[0].outputStock[0]
    ).not.toHaveProperty("quoteUnitCost");
  });

  it("records actual production expense as a quote memo without recognizing another stock asset", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      carryLossByCommodity: { steel: 0 },
      producers: [
        plant({
          capacityUnits: 10,
          inputs: [],
          labourCost: 20,
          otherOperatingCost: 10,
          outputs: [
            {
              commodity: "steel",
              book: "world",
              unitsPerOutput: 1,
              referenceUnitPrice: 9,
              policy: { kind: "manual", unitPrice: 3 },
              storable: true,
            },
          ],
        }),
      ],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 10,
      profit: -30,
      cashFlow: -30,
      outputStock: [{ commodity: "steel", book: "world", units: 10, quoteUnitCost: 3 }],
    });
  });

  it.each([true, false])(
    "does not invent or re-expense the older stock cost, known=%s",
    (known) => {
      const result = advanceProducerEconomy({
        turn: 1,
        accounts,
        carryLossByCommodity: { steel: 0 },
        producers: [
          plant({
            capacityUnits: 10,
            inputs: [],
            labourCost: 20,
            otherOperatingCost: 10,
            outputs: [
              {
                commodity: "steel",
                book: "world",
                unitsPerOutput: 1,
                referenceUnitPrice: 9,
                policy: { kind: "manual", unitPrice: 3 },
                storable: true,
              },
            ],
            outputStock: [
              {
                commodity: "steel",
                book: "world",
                units: 5,
                ...(known ? { quoteUnitCost: 2 } : {}),
              },
            ],
          }),
        ],
      });
      const receipt = result.producers[0];
      expect(receipt.profit).toBe(-30);
      expect(receipt.outputStock[0].units).toBe(15);
      if (known) expect(receipt.outputStock[0].quoteUnitCost).toBeCloseTo(40 / 15);
      else expect(receipt.outputStock[0]).not.toHaveProperty("quoteUnitCost");
    }
  );

  it.each([0, 6])(
    "consumes reserved and fallback inputs once, reserved supplier stock=%s",
    (contractedStock) => {
      const result = advanceProducerEconomy({
        turn: 1,
        accounts: [...accounts, { id: "contract-seller", cash: 0 }],
        producers: [
          plant({
            capacityUnits: 10,
            labourCost: 0,
            otherOperatingCost: 0,
            inputs: [
              { commodity: "energy", book: "world", unitsPerOutput: 2, maximumUnitPrice: 2 },
            ],
          }),
        ],
        inputReservations: [
          {
            id: "agreement",
            producerId: "plant",
            commodity: "energy",
            supplierOfferId: "contract-power",
            units: 6,
            unitPrice: 1,
          },
        ],
        externalOffers: [
          {
            id: "contract-power",
            accountId: "contract-seller",
            commodity: "energy",
            book: "world",
            units: contractedStock,
            unitPrice: 5,
          },
          {
            id: "public-power",
            accountId: "supplier",
            commodity: "energy",
            book: "world",
            units: 20,
            unitPrice: 2,
          },
        ],
      });
      const expense = contractedStock + (20 - contractedStock) * 2;
      expect(result.producers[0]).toMatchObject({
        producedUnits: 10,
        purchases: expense,
        inputsConsumed: expense,
        cashFlow: -expense,
        profit: -expense,
      });
      expect(result.accounts.find((account) => account.id === "corp")!.cash).toBe(1000 - expense);
      expect(
        [...producerTrades(result.tradeReceipt)].reduce((sum, trade) => sum + trade.units, 0)
      ).toBe(20);
    }
  );

  it("carries unpaid bills forward and never expenses their later payment twice", () => {
    const first = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((account) =>
        account.id === "corp" ? { ...account, cash: 0 } : account
      ),
      producers: [plant({ inputs: [] })],
    });
    // No cash: the plant staffs nothing, so only the fixed site bill is owed.
    expect(first.producers[0]).toMatchObject({ profit: -10, cashFlow: 0, closingArrears: 10 });
    expect(first.payables.reduce((sum, claim) => sum + claim.amount, 0)).toBe(10);
    const transfer = (rows: typeof first.accounts, amount: number) =>
      rows.map((account) => ({
        ...account,
        cash:
          account.cash +
          (account.id === "corp" ? amount : account.id === "households" ? -amount : 0),
      }));
    const second = advanceProducerEconomy({
      turn: 2,
      accounts: transfer(first.accounts, 15),
      payables: first.payables,
      producers: [plant({ inputs: [] })],
    });
    expect(second.producers[0]).toMatchObject({
      producedUnits: 0,
      profit: -10,
      cashFlow: -15,
      arrearsPaid: 10,
      closingArrears: 5,
    });
    const third = advanceProducerEconomy({
      turn: 3,
      accounts: transfer(second.accounts, 80),
      payables: second.payables,
      producers: [plant({ inputs: [] })],
    });
    expect(third.producers[0]).toMatchObject({
      profit: -30,
      cashFlow: -35,
      arrearsPaid: 5,
      closingArrears: 0,
    });
    expect(third.payables).toEqual([]);
    expect(third.accounts.find((account) => account.id === "corp")!.cash).toBe(45);
  });

  it("reserves received cash for an unpaid creditor before allowing discretionary purchases", () => {
    const claims = [
      {
        debtorAccountId: "corp",
        creditorAccountId: "households",
        producerId: "closed-a",
        kind: "labour" as const,
        amount: 10,
      },
      {
        debtorAccountId: "households",
        creditorAccountId: "services",
        producerId: "closed-b",
        kind: "operating" as const,
        amount: 10,
      },
    ];
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "corp", cash: 10 },
        { id: "households", cash: 0 },
        { id: "services", cash: 0 },
        { id: "supplier", cash: 0 },
      ],
      producers: [],
      payables: claims.map((claim) => ({ ...claim, id: producerPayableId(claim) })),
      externalOffers: [
        {
          id: "goods",
          accountId: "supplier",
          commodity: "goods",
          book: "world",
          units: 10,
          unitPrice: 1,
        },
      ],
      externalOrders: [
        {
          id: "shopping",
          accountId: "households",
          commodity: "goods",
          book: "world",
          units: 10,
          maximumUnitPrice: 1,
        },
      ],
    });
    expect(result.tradeReceipt.tradeCount).toBe(0);
    expect(result.accounts.find((account) => account.id === "households")!.cash).toBe(10);
    expect(result.payables).toHaveLength(1);
    expect(result.payables[0]).toMatchObject({
      debtorAccountId: "households",
      creditorAccountId: "services",
      amount: 10,
    });
  });

  it("retains a creditor's bill after the producing site closes", () => {
    const claim = {
      debtorAccountId: "corp",
      creditorAccountId: "households",
      producerId: "closed-plant",
      kind: "labour" as const,
      amount: 20,
    };
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [],
      payables: [{ ...claim, id: producerPayableId(claim) }],
    });
    expect(result.producers).toEqual([]);
    expect(result.payables).toEqual([]);
    expect(result.payablePayments[0].amount).toBe(20);
    expect(result.accounts.find((account) => account.id === "corp")!.cash).toBe(980);
  });

  it("writes off only the lost acquisition value of unused inputs without another cash charge", () => {
    const first = advanceProducerEconomy({
      turn: 1,
      accounts,
      carryLossByCommodity: { food: 0.25 },
      producers: [
        plant({
          capacityUnits: 0,
          inputs: [],
          inputStock: [{ commodity: "food", units: 100, value: 200 }],
        }),
      ],
    });
    expect(first.producers[0]).toMatchObject({
      inventoryWriteOff: 50,
      inputsConsumed: 0,
      profit: -80,
      cashFlow: -30,
      inputStock: [{ commodity: "food", units: 75, value: 150 }],
    });
    const second = advanceProducerEconomy({
      turn: 2,
      accounts: first.accounts,
      carryLossByCommodity: { food: 0.25 },
      producers: [
        plant({ capacityUnits: 0, inputs: [], inputStock: first.producers[0].inputStock }),
      ],
    });
    expect(second.producers[0]).toMatchObject({
      inventoryWriteOff: 37.5,
      profit: -67.5,
      cashFlow: -30,
      inputStock: [{ commodity: "food", units: 56.25, value: 112.5 }],
    });
    expect(second.accounts.find((account) => account.id === "corp")!.cash).toBe(940);
  });

  it("reconciles sold, carried and lost output without expensing old production twice", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      carryLossByCommodity: { steel: 0.25 },
      producers: [
        plant({
          capacityUnits: 0,
          labourCost: 0,
          otherOperatingCost: 0,
          inputs: [],
          outputs: [
            {
              commodity: "steel",
              book: "world",
              unitsPerOutput: 1,
              policy: { kind: "manual", unitPrice: 3 },
              referenceUnitPrice: 3,
              storable: true,
            },
          ],
          outputStock: [{ commodity: "steel", book: "world", units: 100 }],
        }),
      ],
      externalOrders: [
        {
          id: "steel-buyer",
          accountId: "households",
          commodity: "steel",
          book: "world",
          units: 40,
          maximumUnitPrice: 3,
        },
      ],
    });
    expect(result.producers[0]).toMatchObject({
      profit: 120,
      inventoryWriteOff: 0,
      outputStock: [{ commodity: "steel", book: "world", units: 45 }],
    });
    expect(result.producers[0].products[0]).toMatchObject({
      offeredUnits: 100,
      deliveredUnits: 40,
      unsoldUnits: 60,
      lostUnits: 15,
    });
  });

  it("writes down over-cover finished stock without expensing its production again", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      stockCoverTurns: 2,
      producers: [
        plant({
          capacityUnits: 0,
          labourCost: 0,
          otherOperatingCost: 0,
          inputs: [],
          recentSoldUnits: 1,
          outputs: [
            {
              commodity: "steel",
              book: "world",
              unitsPerOutput: 1,
              policy: { kind: "manual", unitPrice: 3 },
              referenceUnitPrice: 3,
              storable: true,
            },
          ],
          outputStock: [{ commodity: "steel", book: "world", units: 100, quoteUnitCost: 2 }],
        }),
      ],
      externalOrders: [],
    });
    const producer = result.producers[0];
    const kept = producer.outputStock.reduce((n, s) => n + s.units, 0);
    expect(kept).toBeLessThan(100);
    expect(producer.inventoryWriteOff).toBe(0);
    expect(producer.profit).toBe(0);
  });

  it("reports paid unit prices separately from internal site deliveries", () => {
    const energy = {
      commodity: "energy",
      book: "world",
      unitsPerOutput: 1,
      referenceUnitPrice: 3,
      policy: { kind: "manual" as const, unitPrice: 3 },
      storable: false,
    };
    const steel = {
      ...energy,
      commodity: "steel",
      referenceUnitPrice: 2,
      policy: { kind: "manual" as const, unitPrice: 2 },
      storable: true,
    };
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [
        plant({ id: "power", capacityUnits: 10, inputs: [], outputs: [energy] }),
        plant({
          id: "steel",
          capacityUnits: 10,
          inputs: [
            { commodity: "energy", book: "world", unitsPerOutput: 0.5, maximumUnitPrice: 3 },
          ],
          outputs: [steel],
        }),
      ],
      externalOrders: [
        {
          id: "energy-customer",
          accountId: "households",
          commodity: "energy",
          book: "world",
          units: 5,
          maximumUnitPrice: 3,
        },
        {
          id: "steel-customer",
          accountId: "households",
          commodity: "steel",
          book: "world",
          units: 10,
          maximumUnitPrice: 2,
        },
      ],
    });
    expect(result.producers.find((p) => p.id === "power")!.products[0]).toMatchObject({
      soldUnits: 5,
      deliveredUnits: 10,
      internalDeliveredUnits: 5,
      revenue: 15,
      realizedUnitPrice: 3,
    });
    expect(result.producers.find((p) => p.id === "steel")!.purchases).toBe(0);
  });
  it("can run a partial batch entirely from this site's purchased inputs", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputStock: [{ commodity: "energy", units: 100, value: 40 }] })],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 50,
      plannedUnits: 50,
      purchases: 0,
      inputsConsumed: 40,
      // Half the run was made, so half the wages; no idle floor given, site unchanged.
      labourPaid: 10,
      billedRunShare: 0.5,
      cashFlow: -20,
    });
  });

  it("cannot plan another site's production from privately retained inputs", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [
        plant({
          id: "owner",
          activeFraction: 0,
          inputStock: [{ commodity: "energy", units: 100, value: 40 }],
        }),
        plant({ id: "other" }),
      ],
    });
    expect(result.producers.find((p) => p.id === "other")!.plannedUnits).toBe(0);
    expect(result.producers.find((p) => p.id === "owner")!.inputStock[0]).toMatchObject({
      units: 0,
      value: 0,
    });
  });
  it("cannot produce or sell output without delivered inputs", () => {
    const result = advanceProducerEconomy({ turn: 1, accounts, producers: [plant()] });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 0,
      revenue: 0,
      purchases: 0,
      // Nothing made, no wages owed; without an idle floor the site bill is unchanged.
      labourPaid: 0,
      otherOperatingPaid: 10,
      profit: -10,
      cashFlow: -10,
    });
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBe(2000);
  });

  it("bills wages and site running costs on the run actually made, keeping cold upkeep", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ otherOperatingCost: 10, idleOperatingCost: 2 })],
      externalOffers: [
        {
          id: "power",
          accountId: "supplier",
          commodity: "energy",
          book: "world",
          units: 50,
          unitPrice: 1,
        },
      ],
    });
    const r = result.producers[0];
    expect(r.producedUnits).toBeCloseTo(25);
    expect(r.billedRunShare).toBeCloseTo(0.25);
    // The sector's input gauge names the input that cut the run.
    expect(r.bindingInput).toBe("energy");
    // Wages: a quarter of 20. Site: cold floor 2 plus a quarter of the running 8.
    expect(r.labourPaid).toBeCloseTo(5);
    expect(r.otherOperatingPaid).toBeCloseTo(4);
    expect(r.idleOperatingCost).toBeCloseTo(2);
    expect(r.labourArrears).toBeCloseTo(0);
    expect(r.profit).toBeCloseTo(r.revenue - 50 - 5 - 4);
    const cashOf = (id: string) => result.accounts.find((a) => a.id === id)!.cash;
    // Households keep only the wages earned (minus what they spent), services the trued bill.
    expect(cashOf("services")).toBeCloseTo(4);
    expect(cashOf("corp")).toBeCloseTo(1000 - 50 - 5 - 4 + r.revenue);
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBeCloseTo(2000, 9);
  });

  it("a sold-out plant starved of inputs holds its plan next turn; one under materials brakes", () => {
    const settle = (price: number) =>
      advanceProducerEconomy({
        turn: 1,
        accounts,
        producers: [
          plant({
            idleOperatingCost: 2,
            plannedRunShare: 1,
            outputs: [
              {
                commodity: "financial_services",
                unitsPerOutput: 1,
                book: "world",
                policy: { kind: "manual", unitPrice: price },
                referenceUnitPrice: price,
                storable: false,
              },
            ],
          }),
        ],
        externalOffers: [
          {
            id: "power",
            accountId: "supplier",
            commodity: "energy",
            book: "world",
            units: 50,
            unitPrice: 1,
          },
        ],
        externalOrders: [
          {
            id: "buyer",
            accountId: "households",
            commodity: "financial_services",
            book: "world",
            units: 100,
            maximumUnitPrice: 5,
          },
        ],
      }).producers[0];
    // Sells all 25 it could make at 3: revenue 75 against materials 50, wages 5, site 4.
    // Billed for the planned run (wages 20, site 10) the same run read as a loss.
    const held = settle(3);
    expect(held.soldUnits).toBeCloseTo(25);
    expect(demandPlanRunShare(held)).toBeCloseTo(1, 12);
    // Selling at 1.5 does not cover 2 of materials per unit: the brake still cuts.
    const braked = settle(1.5);
    expect(braked.soldUnits).toBeCloseTo(25);
    expect(demandPlanRunShare(braked)).toBeCloseTo(0.25 * (1 - OUTPUT_CUT_STEP), 12);
  });

  it("does not credit households with wages for output the plant never made", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ idleOperatingCost: 2 })],
    });
    const cashOf = (id: string) => result.accounts.find((a) => a.id === id)!.cash;
    expect(result.producers[0]).toMatchObject({
      producedUnits: 0,
      billedRunShare: 0,
      labourPaid: 0,
      otherOperatingPaid: 2,
      profit: -2,
    });
    expect(cashOf("households")).toBe(1000);
    expect(cashOf("services")).toBe(2);
    expect(cashOf("corp")).toBe(998);
  });

  it("buys only available inputs and produces only the supported recipe quantity", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant()],
      externalOffers: [
        {
          id: "power",
          accountId: "supplier",
          commodity: "energy",
          book: "world",
          units: 50,
          unitPrice: 1,
        },
      ],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 25,
      purchases: 50,
      inputsConsumed: 50,
      // A quarter of the run was made: wages 5 of 20, site 10 (no idle floor given).
      labourPaid: 5,
      profit: -65,
      cashFlow: -65,
    });
    expect(result.producers[0].outputStock[0].units).toBe(0);
    expect([...producerTrades(result.tradeReceipt)][0]).toMatchObject({ units: 50, amount: 50 });
  });

  it("does not charge already purchased inputs again when their reference price changes", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputStock: [{ commodity: "energy", units: 200, value: 80 }] })],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 100,
      purchases: 0,
      inputsConsumed: 80,
      profit: -110,
      cashFlow: -30,
    });
    expect(result.accounts.find((a) => a.id === "corp")!.cash).toBe(970);
  });

  it("books no stock at cost for unsold output that cannot be stored", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputStock: [{ commodity: "energy", units: 200, value: 80 }] })],
    });
    const producer = result.producers[0];
    expect(producer).toMatchObject({ producedUnits: 100, soldUnits: 0, inputsConsumed: 80 });
    expect(producer.products[0]).toMatchObject({ unsoldUnits: 100, lostUnits: 100 });
    expect(producer.unsoldProductionCost).toBe(0);
  });

  it("books only the unsold output still held at close as stock at cost", () => {
    const storable = (carryLossByCommodity?: Record<string, number>) =>
      advanceProducerEconomy({
        turn: 1,
        accounts,
        ...(carryLossByCommodity ? { carryLossByCommodity } : {}),
        producers: [
          plant({
            inputStock: [{ commodity: "energy", units: 200, value: 80 }],
            outputs: [
              {
                commodity: "steel",
                book: "world",
                unitsPerOutput: 1,
                policy: { kind: "manual", unitPrice: 3 },
                referenceUnitPrice: 3,
                storable: true,
              },
            ],
          }),
        ],
      }).producers[0];
    // The inputs in the run follow the units still held: 80 across 100 made.
    const atCost = (p: ReturnType<typeof storable>) =>
      (80 * p.outputStock.reduce((n, s) => n + s.units, 0)) / 100;
    const held = storable();
    expect(held.unsoldProductionCost).toBeGreaterThan(79);
    expect(held.unsoldProductionCost).toBeCloseTo(atCost(held), 9);
    // A quarter of the unsold run is lost in carry, so only three quarters is stock.
    const lossy = storable({ steel: 0.25 });
    expect(lossy.products[0]).toMatchObject({ unsoldUnits: 100, lostUnits: 25 });
    expect(lossy.unsoldProductionCost).toBeCloseTo(60, 9);
  });

  it("offers only existing stock plus input-backed production and expires undelivered services", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [
        plant({
          inputStock: [{ commodity: "energy", units: 200, value: 100 }],
          outputStock: [{ commodity: "financial_services", book: "world", units: 50 }],
        }),
      ],
      externalOrders: [
        {
          id: "consumer",
          accountId: "households",
          commodity: "financial_services",
          book: "world",
          units: 20,
          maximumUnitPrice: 3,
        },
      ],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 100,
      offeredUnits: 150,
      deliveredUnits: 20,
      revenue: 60,
      purchases: 0,
      inputsConsumed: 100,
      profit: -70,
      cashFlow: 30,
    });
    expect(result.producers[0].outputStock[0].units).toBe(0);
    expect(result.prices[0]).toMatchObject({
      commodity: "financial_services",
      unitPrice: 3,
      units: 20,
    });
  });

  it("retains unsold physical stock and charges fixed bills despite full sales of a small run", () => {
    const p = plant({
      capacityUnits: 2,
      inputs: [],
      outputs: [
        {
          commodity: "financial_services",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 3 },
          referenceUnitPrice: 3,
          storable: true,
        },
      ],
    });
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [p],
      externalOrders: [
        {
          id: "customer",
          accountId: "households",
          commodity: "financial_services",
          book: "world",
          units: 2,
          maximumUnitPrice: 3,
        },
      ],
    });
    expect(result.producers[0]).toMatchObject({ deliveredUnits: 2, revenue: 6, profit: -24 });
    expect(result.producers[0].outputStock[0].units).toBe(0);
  });

  it("echoes the planned run share on the receipt so a later turn can grow from it", () => {
    const run = (p: ProductionPlan) =>
      advanceProducerEconomy({ turn: 1, accounts, producers: [p] }).producers[0];
    expect(run(plant({ plannedRunShare: 0.75 })).plannedRunShare).toBe(0.75);
    expect(run(plant())).not.toHaveProperty("plannedRunShare");
  });

  it("does not pay wages or buy inputs from bank deposits or anticipated revenue", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) => (a.id === "corp" ? { ...a, cash: 0 } : a)),
      producers: [plant({ inputStock: [{ commodity: "energy", units: 200, value: 100 }] })],
    });
    expect(result.producers[0]).toMatchObject({
      producedUnits: 0,
      labourPaid: 0,
      otherOperatingPaid: 0,
      operatingArrears: 10,
      labourArrears: 0,
      otherOperatingArrears: 10,
      inventoryWriteOff: 100,
      profit: -110,
      cashFlow: 0,
    });
    expect(result.producers[0].inputStock[0].units).toBe(0);
  });

  it("allocates one corporation fixed-bill funding proportionally across its sites", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) => (a.id === "corp" ? { ...a, cash: 30 } : a)),
      producers: [plant({ id: "b", inputs: [] }), plant({ id: "a", inputs: [] })],
    });
    // 30 cash pays both site bills (20) and staffs a quarter of the wages (40),
    // so each site runs a quarter and nothing is owed.
    expect(result.producers.map((p) => p.producedUnits)).toEqual([25, 25]);
    expect(result.producers.map((p) => p.operatingArrears)).toEqual([0, 0]);
    expect(result.accounts.find((a) => a.id === "corp")!.cash).toBe(0);
  });

  it("is independent of producer input array ordering", () => {
    const a = plant({
      id: "a",
      inputs: [],
      outputs: [
        {
          commodity: "goods",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "automatic", targetMarkup: 0.1 },
          referenceUnitPrice: 3,
          storable: true,
        },
      ],
      outputStock: [{ commodity: "goods", book: "world", units: 20 }],
    });
    const b = plant({
      id: "b",
      inputs: [],
      outputs: [
        {
          commodity: "goods",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 2 },
          referenceUnitPrice: 3,
          storable: true,
        },
      ],
      outputStock: [{ commodity: "goods", book: "world", units: 20 }],
    });
    const args = {
      turn: 1,
      accounts,
      externalOrders: [
        {
          id: "customer",
          accountId: "households",
          commodity: "goods",
          book: "world",
          units: 30,
          maximumUnitPrice: 3,
        },
      ],
    };
    expect(advanceProducerEconomy({ ...args, producers: [a, b] })).toEqual(
      advanceProducerEconomy({ ...args, producers: [b, a] })
    );
  });

  it("anchors an automatic ask to last turn's clearing in its own lane", () => {
    const seller = plant({
      inputs: [],
      labourCost: 0,
      otherOperatingCost: 0,
      outputs: [
        {
          commodity: "goods",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "automatic", targetMarkup: 0.1 },
          referenceUnitPrice: 3,
          storable: true,
        },
      ],
      outputStock: [{ commodity: "goods", book: "world", units: 20 }],
    });
    const args = {
      turn: 1,
      accounts,
      producers: [seller],
      externalOrders: [
        {
          id: "customer",
          accountId: "households",
          commodity: "goods",
          book: "world",
          units: 10,
          maximumUnitPrice: 4,
        },
      ],
    };
    const traded = (result: ReturnType<typeof advanceProducerEconomy>) => {
      const row = result.prices.find((p) => p.commodity === "goods" && p.book === "world")!;
      return row.value / row.units;
    };
    expect(traded(advanceProducerEconomy(args))).toBeCloseTo(3.3);
    expect(
      traded(advanceProducerEconomy({ ...args, clearingPriceByLane: { "goods|world": 2 } }))
    ).toBeCloseTo(2.2);
    // Another book's clearing does not move this lane.
    expect(
      traded(advanceProducerEconomy({ ...args, clearingPriceByLane: { "goods|state:CA": 2 } }))
    ).toBeCloseTo(3.3);
  });

  it("settles productive input cycles jointly without selling unsupported output", () => {
    const a = plant({
      id: "power",
      accountId: "corp",
      capacityUnits: 10,
      labourCost: 0,
      otherOperatingCost: 0,
      inputs: [{ commodity: "steel", book: "world", unitsPerOutput: 0.5, maximumUnitPrice: 1 }],
      outputs: [
        {
          commodity: "energy",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 1 },
          referenceUnitPrice: 1,
          storable: true,
        },
      ],
    });
    const b = plant({
      id: "steel",
      accountId: "supplier",
      capacityUnits: 10,
      labourCost: 0,
      otherOperatingCost: 0,
      inputs: [{ commodity: "energy", book: "world", unitsPerOutput: 0.5, maximumUnitPrice: 1 }],
      outputs: [
        {
          commodity: "steel",
          book: "world",
          unitsPerOutput: 1,
          policy: { kind: "manual", unitPrice: 1 },
          referenceUnitPrice: 1,
          storable: true,
        },
      ],
    });
    const funded = accounts.map((a) => (a.id === "supplier" ? { ...a, cash: 100 } : a));
    const result = advanceProducerEconomy({ turn: 1, accounts: funded, producers: [a, b] });
    expect(result.producers.map((p) => p.producedUnits)).toEqual([10, 10]);
    expect([...producerTrades(result.tradeReceipt)].reduce((n, t) => n + t.units, 0)).toBe(10);
    expect(result.producers.map((p) => p.outputStock[0].units)).toEqual([0, 4.99]);
    expect(result.producers[0].products[0].lostUnits).toBe(5);
    expect(result.producers[1].products[0].lostUnits).toBeCloseTo(0.01);
    const empty = funded.map((a) => (["corp", "supplier"].includes(a.id) ? { ...a, cash: 0 } : a));
    const unfunded = advanceProducerEconomy({ turn: 1, accounts: empty, producers: [a, b] });
    expect(unfunded.producers.map((p) => p.producedUnits)).toEqual([0, 0]);
    expect([...producerTrades(unfunded.tradeReceipt)]).toEqual([]);
  });

  it("preserves physical productivity improvements above nameplate and reports the actual unit price", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputs: [], outputMultiplier: 1.25 })],
      externalOrders: [
        {
          id: "customer",
          accountId: "households",
          commodity: "financial_services",
          book: "world",
          units: 200,
          maximumUnitPrice: 3,
        },
      ],
    });
    expect(result.producers[0].producedUnits).toBe(125);
    expect(result.producers[0].products[0]).toMatchObject({
      producedUnits: 125,
      deliveredUnits: 125,
      askingUnitPrice: 3,
      realizedUnitPrice: 3,
      revenue: 375,
    });
  });

  it("keeps a productive supplier cycle alive when an earlier final buyer competes for its inputs", () => {
    const output = (commodity: string, unitPrice = 1) => ({
      commodity,
      book: "world",
      unitsPerOutput: 1,
      policy: { kind: "manual" as const, unitPrice },
      referenceUnitPrice: unitPrice,
      storable: true,
    });
    const input = (commodity: string, unitsPerOutput: number) => ({
      commodity,
      book: "world",
      unitsPerOutput,
      maximumUnitPrice: 1,
    });
    const common = { capacityUnits: 10, labourCost: 0, otherOperatingCost: 0 };
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: [
        ...accounts.map((a) => (a.id === "supplier" ? { ...a, cash: 1000 } : a)),
        { id: "final", cash: 1000 },
      ],
      producers: [
        plant({
          ...common,
          id: "a-final",
          accountId: "final",
          inputs: [input("energy", 1), input("steel", 1)],
          outputs: [output("goods", 5)],
        }),
        plant({
          ...common,
          id: "power",
          inputs: [input("steel", 0.5)],
          outputs: [output("energy")],
        }),
        plant({
          ...common,
          id: "steel",
          accountId: "supplier",
          inputs: [input("energy", 0.5)],
          outputs: [output("steel")],
        }),
      ],
    });
    expect(result.producers.map((p) => p.producedUnits)).toEqual([5, 10, 10]);
    expect(result.accounts.reduce((sum, a) => sum + a.cash, 0)).toBe(4000);
  });
});

describe("same-turn spillover", () => {
  const stockOnly = (id: string, commodity: string, units: number, price: number): ProductionPlan =>
    plant({
      id,
      accountId: `${id}-corp`,
      capacityUnits: 0,
      labourCost: 0,
      otherOperatingCost: 0,
      inputs: [],
      outputs: [
        {
          commodity,
          book: "world",
          unitsPerOutput: 0,
          referenceUnitPrice: price,
          retainedUnitCost: 1,
          policy: { kind: "manual", unitPrice: price },
          storable: true,
        },
      ],
      outputStock: [{ commodity, book: "world", units, quoteUnitCost: 1 }],
    });
  const run = (spilloverShare?: number) =>
    advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "scarce-corp", cash: 0 },
        { id: "plenty-corp", cash: 0 },
        { id: "households", cash: 1000 },
        { id: "services", cash: 0 },
      ],
      carryLossByCommodity: { steel: 0, food: 0 },
      producers: [stockOnly("scarce", "steel", 2, 10), stockOnly("plenty", "food", 1000, 5)],
      households: [
        {
          accountId: "households",
          spendFraction: 1,
          products: [
            { commodity: "steel", book: "world", maximumUnitPrice: 12, weight: 1 },
            { commodity: "food", book: "world", maximumUnitPrice: 6, weight: 1 },
          ],
        },
      ],
      ...(spilloverShare === undefined ? {} : { spilloverShare }),
    });
  const spent = (r: ReturnType<typeof run>) =>
    1000 - r.accounts.find((a) => a.id === "households")!.cash;

  it("moves household spend stranded in a sold-out lane onto lanes with stock, at the same prices", () => {
    const off = run();
    const on = run(0.7);
    expect(off.spillover).toBeUndefined();
    // Willingness is sized at each lane's price ceiling; fills happen at the posted price.
    expect(spent(off)).toBeCloseTo(2 * 10 + (500 / 6) * 5, 6);
    expect(on.spillover!.strandedSpend).toBeCloseTo(500 - 2 * 12, 6);
    expect(spent(on) - spent(off)).toBeCloseTo(0.7 * 476 * (5 / 6), 6);
    expect(on.spillover!.recovered).toBeCloseTo(0.7 * 476 * (5 / 6), 6);
    const price = (r: ReturnType<typeof run>, commodity: string) =>
      r.prices.find((p) => p.commodity === commodity)!.unitPrice;
    expect(price(on, "food")).toBeCloseTo(price(off, "food"), 12);
    expect(price(on, "steel")).toBeCloseTo(price(off, "steel"), 12);
  });
});

describe("spillover measurement tags", () => {
  const output = (commodity: string, price: number) => ({
    commodity,
    book: "world",
    unitsPerOutput: 0,
    referenceUnitPrice: price,
    retainedUnitCost: 1,
    policy: { kind: "manual" as const, unitPrice: price },
    storable: true,
  });
  const stock = (id: string, commodity: string, units: number, price: number): ProductionPlan =>
    plant({
      id,
      accountId: `${id}-corp`,
      capacityUnits: 0,
      labourCost: 0,
      otherOperatingCost: 0,
      labourRecipientAccountId: "services",
      inputs: [],
      outputs: [output(commodity, price)],
      outputStock: [{ commodity, book: "world", units, quoteUnitCost: 1 }],
    });
  const run = () =>
    advanceProducerEconomy({
      turn: 1,
      accounts: [
        { id: "scarce-corp", cash: 0 },
        { id: "plenty-corp", cash: 0 },
        { id: "chem-corp", cash: 0 },
        { id: "hh-a", cash: 1000 },
        { id: "hh-b", cash: 700 },
        { id: "services", cash: 0 },
      ],
      carryLossByCommodity: { steel: 0, food: 0, chemicals: 0 },
      producers: [
        stock("scarce", "steel", 2, 10),
        stock("plenty", "food", 1000, 5),
        stock("chem", "chemicals", 500, 2),
      ],
      households: [
        {
          accountId: "hh-a",
          countryId: "US",
          spendFraction: 1,
          products: [
            { commodity: "steel", book: "world", maximumUnitPrice: 12, weight: 1 },
            { commodity: "food", book: "world", maximumUnitPrice: 6, weight: 1 },
            { commodity: "chemicals", book: "world", maximumUnitPrice: 3, weight: 0.2 },
          ],
        },
        {
          accountId: "hh-b",
          countryId: "DE",
          spendFraction: 1,
          products: [
            { commodity: "steel", book: "world", maximumUnitPrice: 12, weight: 2 },
            { commodity: "chemicals", book: "world", maximumUnitPrice: 3, weight: 1 },
          ],
        },
      ],
      spilloverShare: 0.7,
      trackCountryBooks: true,
    });
  const untagged = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(untagged)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .filter(
                ([k]) =>
                  k !== "spilloverRequested" && k !== "spilloverRequestedUnits" && k !== "planning"
              )
              .map(([k, v]) => [k, untagged(v)])
          )
        : value;

  it("leaves every settlement number byte-identical to the untagged settlement", () => {
    // Digest of this fixture's full result (accounts, payables, producers,
    // trade receipt, prices, order outcomes, spillover, country books) from
    // the settlement before spillover was tagged. The tags are measurement
    // only, so with them and planning diagnostics removed the settlement
    // numbers must not change by a byte. Keep the original financial digest.
    const json = JSON.stringify(untagged(run()));
    expect(createHash("sha256").update(json).digest("hex")).toBe(
      "8b7485b3de05658f83b615512cc96e9980d1a615ac1708b7ccd2ef65a603827d"
    );
  });

  it("tags the spillover part of each household order and country book row", () => {
    const result = run();
    expect(result.spillover!.extraRequested).toBeGreaterThan(0);
    const outcome = (accountId: string, commodity: string) =>
      result.orderOutcomes.find((o) => o.accountId === accountId && o.commodity === commodity)!;
    // DE wanted 700 / 3 weight split: one third of its budget on chemicals at
    // a ceiling of 3 is 77.78 units; the rest is the 70% of stranded steel spend.
    const chem = outcome("hh-b", "chemicals");
    expect(chem.requestedUnits - chem.spilloverRequestedUnits!).toBeCloseTo(700 / 3 / 3, 9);
    expect(chem.deliveredUnits).toBeCloseTo(chem.requestedUnits, 9);
    expect(outcome("hh-a", "steel").spilloverRequestedUnits).toBeUndefined();
    const spilledSpend = result.orderOutcomes.reduce((sum, o) => {
      const price = o.commodity === "food" ? 6 : o.commodity === "chemicals" ? 3 : 12;
      return sum + (o.spilloverRequestedUnits ?? 0) * price;
    }, 0);
    expect(spilledSpend).toBeCloseTo(result.spillover!.extraRequested, 9);
    for (const row of result.countryBooks!) {
      const tagged = result.orderOutcomes
        .filter(
          (o) =>
            o.commodity === row.commodity &&
            o.accountId === (row.countryId === "US" ? "hh-a" : "hh-b")
        )
        .reduce((sum, o) => sum + (o.spilloverRequestedUnits ?? 0), 0);
      expect(row.spilloverRequested ?? 0).toBeCloseTo(tagged, 9);
    }
  });
});

describe("minor inputs in make-do", () => {
  // Energy is 2 per unit at 1; construction 0.001 per unit at 10 is 0.5% of input cost.
  const recipe = [
    { commodity: "energy", unitsPerOutput: 2, book: "world", maximumUnitPrice: 1 },
    {
      commodity: "construction_services",
      unitsPerOutput: 0.001,
      book: "world",
      maximumUnitPrice: 10,
    },
  ];
  const offer = (commodity: string, units: number, unitPrice: number) => ({
    id: commodity,
    accountId: "supplier",
    commodity,
    book: "world",
    units,
    unitPrice,
  });

  it("a plant missing only a minor input runs its plan and pays the premium", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputs: recipe })],
      externalOffers: [offer("energy", 200, 1), offer("construction_services", 0.01, 10)],
    });
    const r = result.producers[0];
    expect(r.producedUnits).toBeCloseTo(100, 9);
    // Needed 0.1, had 0.01: 0.09 missing at 10 times the premium.
    const premium = 0.09 * 10 * MINOR_INPUT_SHORTFALL_PREMIUM;
    expect(r.minorInputPremium).toBeCloseTo(premium, 9);
    expect(r.profit).toBeCloseTo(r.revenue - r.inputsConsumed - premium - 20 - 10, 9);
    const cashOf = (id: string) => result.accounts.find((a) => a.id === id)!.cash;
    expect(cashOf("services")).toBeCloseTo(10 + premium, 9);
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBeCloseTo(2000, 9);
    expect(result.payables).toEqual([]);
  });

  it("owes the premium it cannot pay instead of minting it", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) => (a.id === "corp" ? { ...a, cash: 230 } : a)),
      producers: [plant({ inputs: recipe })],
      externalOffers: [offer("energy", 200, 1)],
    });
    const r = result.producers[0];
    expect(r.producedUnits).toBeGreaterThan(99);
    // No construction at all: every needed unit is improvised.
    const premium = r.producedUnits * 0.001 * 10 * MINOR_INPUT_SHORTFALL_PREMIUM;
    expect(r.minorInputPremium).toBeCloseTo(premium, 9);
    const owed = result.payables
      .filter((c) => c.kind === "operating")
      .reduce((n, c) => n + c.amount, 0);
    const cashOf = (id: string) => result.accounts.find((a) => a.id === id)!.cash;
    expect(owed).toBeGreaterThan(0);
    expect(cashOf("corp")).toBeCloseTo(0, 9);
    expect(cashOf("services") - r.otherOperatingPaid + owed).toBeCloseTo(premium, 9);
    expect(result.accounts.reduce((n, a) => n + a.cash, 0)).toBeCloseTo(1230, 9);
  });

  it("a plant missing a major input is still cut", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [plant({ inputs: recipe })],
      externalOffers: [offer("energy", 50, 1), offer("construction_services", 1, 10)],
    });
    const r = result.producers[0];
    expect(r.producedUnits).toBeCloseTo(25, 9);
    expect(r.minorInputPremium).toBeUndefined();
  });
});

describe("own freight and the input gauge", () => {
  it("feeds a sister plant in the same state and leaves no input cut to report", () => {
    const freight = plant({
      id: "logistics",
      stateId: "CT",
      inputs: [],
      outputs: [
        {
          commodity: "freight",
          unitsPerOutput: 1,
          book: "country:US",
          policy: { kind: "manual", unitPrice: 50 },
          referenceUnitPrice: 50,
          storable: false,
        },
      ],
      capacityUnits: 10,
    });
    const chemicals = plant({
      id: "chemicals",
      stateId: "CT",
      inputs: [
        { commodity: "freight", unitsPerOutput: 0.05, book: "country:US", maximumUnitPrice: 60 },
      ],
    });
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [freight, chemicals],
      ownSitesFirst: true,
    });
    const chem = result.producers.find((p) => p.id === "chemicals")!;
    expect(chem.producedUnits).toBeCloseTo(100);
    expect(chem.runCutBy).toBeUndefined();
    expect(fundedInputThroughput(chem)).toEqual({
      throughputFactor: 1,
      throughputBindingInput: null,
    });
    // The freight went to the sister plant as an internal delivery, not a sale.
    const shipped = result.producers.find((p) => p.id === "logistics")!.products[0];
    expect(shipped.internalDeliveredUnits).toBeCloseTo(5);
    expect(shipped.soldUnits).toBeCloseTo(0);
  });

  it("records what the company's own sites asked for, past what the supplier could make", () => {
    const freight = plant({
      id: "logistics",
      stateId: "CT",
      inputs: [],
      outputs: [
        {
          commodity: "freight",
          unitsPerOutput: 1,
          book: "country:US",
          policy: { kind: "manual", unitPrice: 50 },
          referenceUnitPrice: 50,
          storable: false,
        },
      ],
      capacityUnits: 1,
    });
    const chemicals = plant({
      id: "chemicals",
      stateId: "CT",
      inputs: [
        { commodity: "freight", unitsPerOutput: 0.05, book: "country:US", maximumUnitPrice: 60 },
      ],
    });
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [freight, chemicals],
      externalOffers: [
        {
          id: "freight",
          accountId: "supplier",
          commodity: "freight",
          book: "country:US",
          units: 50,
          unitPrice: 10,
        },
      ],
      ownSitesFirst: true,
    });
    const shipped = result.producers.find((p) => p.id === "logistics")!.products[0];
    expect(shipped.internalDeliveredUnits).toBeCloseTo(1);
    expect(shipped.ownSiteDemandUnits).toBeCloseTo(5);
    const chem = result.producers.find((p) => p.id === "chemicals")!.products[0];
    expect(chem.ownSiteDemandUnits).toBeUndefined();
  });

  it("names the input that cut the run when own freight falls short", () => {
    const freight = plant({
      id: "logistics",
      stateId: "CT",
      inputs: [],
      outputs: [
        {
          commodity: "freight",
          unitsPerOutput: 1,
          book: "country:US",
          policy: { kind: "manual", unitPrice: 50 },
          referenceUnitPrice: 50,
          storable: false,
        },
      ],
      capacityUnits: 2,
    });
    const chemicals = plant({
      id: "chemicals",
      stateId: "CT",
      inputs: [
        { commodity: "freight", unitsPerOutput: 0.05, book: "country:US", maximumUnitPrice: 60 },
      ],
    });
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [freight, chemicals],
      ownSitesFirst: true,
    });
    const chem = result.producers.find((p) => p.id === "chemicals")!;
    expect(chem.producedUnits).toBeCloseTo(40);
    expect(fundedInputThroughput(chem)).toEqual({
      throughputFactor: 0.4,
      throughputBindingInput: "freight",
    });
  });

  it("values own-site deliveries at the sites' bid when they were left short (captive stage 2)", () => {
    const freight = (capacityUnits: number) =>
      plant({
        id: "logistics",
        stateId: "CT",
        inputs: [],
        outputs: [
          {
            commodity: "freight",
            unitsPerOutput: 1,
            book: "country:US",
            policy: { kind: "manual", unitPrice: 30 },
            referenceUnitPrice: 50,
            storable: false,
          },
        ],
        capacityUnits,
      });
    const chemicals = plant({
      id: "chemicals",
      stateId: "CT",
      inputs: [
        { commodity: "freight", unitsPerOutput: 0.05, book: "country:US", maximumUnitPrice: 60 },
      ],
    });
    const run = (capacityUnits: number, captiveShortValue?: boolean) =>
      advanceProducerEconomy({
        turn: 1,
        accounts,
        producers: [freight(capacityUnits), chemicals],
        ownSitesFirst: true,
        ...(captiveShortValue ? { captiveShortValue } : {}),
      }).producers.find((p) => p.id === "logistics")!.products[0];
    // Short: 2 units of own freight against a need of 5. Bid 60, reference 50, ask 30.
    expect(run(2, true).captiveUnitValue).toBeCloseTo(50);
    // Not short: own freight covers the need, so the ask stands.
    expect(run(10, true).captiveUnitValue).toBeUndefined();
    // Stage off: nothing recorded, the receipt is unchanged.
    expect(run(2).captiveUnitValue).toBeUndefined();
    expect(JSON.stringify(run(2))).toBe(JSON.stringify(run(2, false)));
  });
});
