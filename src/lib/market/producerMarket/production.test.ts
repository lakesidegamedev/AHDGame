import { producerPayableId } from "./payablesRules";
import { producerTrades } from "./rules";
import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { demandPlanRunShare, OUTPUT_CUT_STEP } from "./outputResponseRules";
import { MINOR_INPUT_SHORTFALL_PREMIUM } from "./makeDoRules";

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
