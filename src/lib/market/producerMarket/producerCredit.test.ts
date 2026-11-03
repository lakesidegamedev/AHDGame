import { describe, expect, it } from "vitest";
import { producerPayableId, type ProducerPayable } from "./payablesRules";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import {
  creditRunShare,
  payablesNotShrinkingSince,
  producerCreditHeadroom,
} from "./producerCreditRules";
import type { MarketAccount, ProducerOffer, PurchaseOrder } from "./rules";

// A mine: no inputs, 10 units a turn, wages 20 and site bill 10 at a full run.
const mine = (changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id: "mine",
  accountId: "corp",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [
    {
      commodity: "steel",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 5 },
      referenceUnitPrice: 5,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
  ...changes,
});
const buyer = (unitPrice = 5): PurchaseOrder => ({
  id: "buyer",
  accountId: "buyers",
  commodity: "steel",
  book: "world",
  units: 10,
  maximumUnitPrice: unitPrice,
});
const accounts = (corp: number): MarketAccount[] => [
  { id: "corp", cash: corp },
  { id: "households", cash: 0 },
  { id: "services", cash: 0 },
  { id: "buyers", cash: 1000 },
  { id: "supplier", cash: 0 },
];
const claim = (
  amount: number,
  kind: "labour" | "operating" = "labour",
  notShrinkingSince?: number
): ProducerPayable => {
  const row = {
    debtorAccountId: "corp",
    creditorAccountId: kind === "labour" ? "households" : "services",
    producerId: "mine",
    kind,
  } as const;
  return {
    ...row,
    id: producerPayableId(row),
    amount,
    ...(notShrinkingSince != null ? { notShrinkingSince } : {}),
  };
};
const owed = (claims: readonly ProducerPayable[]) => claims.reduce((n, c) => n + c.amount, 0);
const cashOf = (rows: readonly MarketAccount[], id: string) => rows.find((r) => r.id === id)!.cash;
const total = (rows: readonly MarketAccount[]) => rows.reduce((n, r) => n + r.cash, 0);
const credit = { accountIds: ["corp"] };

describe("producer credit rules", () => {
  it("caps headroom at the run-turn limit and stops it when payables are stuck", () => {
    expect(producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 0 })).toBe(60);
    expect(producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 45 })).toBe(15);
    expect(producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 70 })).toBe(0);
    expect(
      producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 10, notShrinkingSince: 6 })
    ).toBe(50);
    expect(
      producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 10, notShrinkingSince: 5 })
    ).toBe(0);
    expect(
      producerCreditHeadroom({ turn: 9, billsAtFullRun: 30, outstanding: 0, runTurns: 0 })
    ).toBe(0);
  });

  it("runs on credit only past the cash-only share, and buys inputs with cash", () => {
    const base = { fixedBills: 10, labour: 20, inputs: 20 };
    expect(creditRunShare({ ...base, cash: 30, headroom: 0 })).toBe(0.5);
    expect(creditRunShare({ ...base, cash: 30, headroom: 60 })).toBe(1);
    // Inputs need cash: with 10 in hand only half the inputs can be bought.
    expect(creditRunShare({ ...base, cash: 10, headroom: 60 })).toBe(0.5);
    expect(creditRunShare({ ...base, inputs: 0, cash: 0, headroom: 60 })).toBe(1);
  });

  it("restarts the stuck clock only when payables shrink", () => {
    expect(payablesNotShrinkingSince({ turn: 7, openingOwed: 0, closingOwed: 30 })).toBe(7);
    expect(
      payablesNotShrinkingSince({ turn: 7, openingOwed: 30, closingOwed: 10, priorSince: 3 })
    ).toBe(7);
    expect(
      payablesNotShrinkingSince({ turn: 7, openingOwed: 30, closingOwed: 30, priorSince: 3 })
    ).toBe(3);
    expect(payablesNotShrinkingSince({ turn: 7, openingOwed: 30, closingOwed: 40 })).toBe(7);
  });
});

describe("running on credit", () => {
  it("a company with no cash keeps producing on credit and repays from its sales", () => {
    const idle = advanceProducerEconomy({
      turn: 1,
      accounts: accounts(0),
      producers: [mine()],
      externalOrders: [buyer()],
    });
    expect(idle.producers[0].producedUnits).toBe(0);

    const first = advanceProducerEconomy({
      turn: 1,
      accounts: accounts(0),
      producers: [mine()],
      externalOrders: [buyer()],
      credit,
    });
    expect(first.producers[0]).toMatchObject({
      producedUnits: 10,
      revenue: 50,
      labourPaid: 0,
      otherOperatingPaid: 0,
      labourArrears: 20,
      otherOperatingArrears: 10,
    });
    expect(owed(first.payables)).toBe(30);
    expect(first.payables.every((c) => c.notShrinkingSince === 1)).toBe(true);
    // No money is created: workers and the site are owed, not paid.
    expect(total(first.accounts)).toBe(total(accounts(0)));
    expect(cashOf(first.accounts, "households")).toBe(0);

    const second = advanceProducerEconomy({
      turn: 2,
      accounts: first.accounts,
      payables: first.payables,
      producers: [mine()],
      externalOrders: [buyer()],
      credit,
    });
    // Last turn's sales pay last turn's wages and site bill first.
    expect(second.payablePayments.reduce((n, c) => n + c.amount, 0)).toBe(30);
    expect(second.producers[0]).toMatchObject({ producedUnits: 10, arrearsPaid: 30 });
    expect(owed(second.payables)).toBeCloseTo(10, 9);
    expect(cashOf(second.accounts, "households")).toBeCloseTo(20 + 20 * (2 / 3), 9);
    expect(total(second.accounts)).toBeCloseTo(total(accounts(0)), 9);

    const third = advanceProducerEconomy({
      turn: 3,
      accounts: second.accounts,
      payables: second.payables,
      producers: [mine()],
      externalOrders: [buyer()],
      credit,
    });
    expect(third.producers[0].producedUnits).toBe(10);
    expect(third.payables).toEqual([]);
  });

  it("caps what a company may owe at its run-turn limit", () => {
    const result = advanceProducerEconomy({
      turn: 5,
      accounts: accounts(0),
      payables: [claim(40)],
      producers: [mine()],
      externalOrders: [buyer()],
      credit,
    });
    // Headroom 2 x 30 - 40 = 20 covers the site bill and half the wages.
    expect(result.producers[0].producedUnits).toBeCloseTo(5, 9);
    expect(owed(result.payables)).toBeCloseTo(60, 9);

    const full = advanceProducerEconomy({
      turn: 5,
      accounts: accounts(0),
      payables: [claim(60)],
      producers: [mine()],
      externalOrders: [buyer()],
      credit,
    });
    expect(full.producers[0].producedUnits).toBe(0);
  });

  it("stops credit once payables have gone four turns without shrinking", () => {
    const run = (since: number) =>
      advanceProducerEconomy({
        turn: 9,
        accounts: accounts(0),
        payables: [claim(10, "labour", since)],
        producers: [mine()],
        externalOrders: [buyer()],
        credit,
      });
    expect(run(6).producers[0].producedUnits).toBe(10);
    const stuck = run(5);
    expect(stuck.producers[0].producedUnits).toBe(0);
    expect(stuck.payables.every((c) => c.notShrinkingSince === 5)).toBe(true);
  });

  it("cannot pile up debt selling below cost", () => {
    let state = { accounts: accounts(0), payables: [] as ProducerPayable[] };
    let peak = 0;
    let lastProduced = 1;
    let stopped = false;
    for (let turn = 1; turn <= 12; turn++) {
      const result = advanceProducerEconomy({
        turn,
        ...state,
        producers: [
          mine({ outputs: [{ ...mine().outputs[0], policy: { kind: "manual", unitPrice: 1 } }] }),
        ],
        externalOrders: [buyer(1)],
        credit,
      });
      lastProduced = result.producers[0].producedUnits;
      if (lastProduced > 0) peak = Math.max(peak, owed(result.payables));
      else stopped = true;
      // Once credit is gone it does not come back while the debt is unpaid.
      if (stopped) expect(lastProduced).toBe(0);
      expect(total(result.accounts)).toBeCloseTo(total(accounts(0)), 9);
      state = { accounts: result.accounts, payables: result.payables };
    }
    // Runs on credit never take it past two turns of wages and site bill. An
    // idle company still owes its site bill each turn, as it did before credit.
    expect(peak).toBeLessThanOrEqual(60 + 1e-9);
    expect(stopped).toBe(true);
  });

  it("buys inputs with cash and owes the wages it cannot cover", () => {
    const plant = mine({
      inputs: [{ commodity: "energy", unitsPerOutput: 2, book: "world", maximumUnitPrice: 1 }],
    });
    const energy: ProducerOffer = {
      id: "energy",
      accountId: "supplier",
      commodity: "energy",
      book: "world",
      units: 100,
      unitPrice: 1,
    };
    const run = (withCredit: boolean) =>
      advanceProducerEconomy({
        turn: 1,
        accounts: accounts(30),
        producers: [plant],
        externalOffers: [energy],
        externalOrders: [buyer()],
        ...(withCredit ? { credit } : {}),
      });
    expect(run(false).producers[0].producedUnits).toBeCloseTo(5, 9);
    const result = run(true);
    expect(result.producers[0]).toMatchObject({ producedUnits: 10, purchases: 20 });
    // Cash bought the inputs; the supplier was paid in full at clearing.
    expect(cashOf(result.accounts, "supplier")).toBe(20);
    expect(owed(result.payables)).toBeCloseTo(20, 9);
    expect(total(result.accounts)).toBeCloseTo(total(accounts(30)), 9);
  });

  it("leaves a cash-rich company and a company off the line unchanged", () => {
    for (const corp of [1000, 0]) {
      const base = {
        turn: 1,
        accounts: accounts(corp),
        producers: [mine()],
        externalOrders: [buyer()],
      };
      const without = advanceProducerEconomy(base);
      // A cash-rich company draws no credit; a state company is not on the line.
      const withLine = advanceProducerEconomy({
        ...base,
        credit: { accountIds: corp > 0 ? ["corp"] : ["someone-else"] },
      });
      expect(withLine).toEqual(without);
    }
  });
});
