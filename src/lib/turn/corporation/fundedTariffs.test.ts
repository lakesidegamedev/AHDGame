import { describe, expect, it } from "vitest";
import { producerMoveLedgerLegs } from "@/lib/market/producerMarket/liveFundingRules";
import { applySettlementClose, type EconomyResult } from "@/lib/market/producerMarket/settlement";
import type { ProducerTradeReceipt } from "@/lib/market/producerMarket/rules";
import { importTariffKey } from "@/lib/market/producerMarket/tariffRules";
import {
  automationLevyAtClose,
  tariffCollectorScopes,
  tariffImporters,
  tariffsAtClose,
  tariffSweepMoves,
} from "./fundedTariffs";

// One US buyer took 10 French iron at 2 and 5 US iron at 2; the US charges 50%
// on French iron.
const receipt: ProducerTradeReceipt = {
  turn: 9,
  offers: [
    {
      id: "fr-iron",
      accountId: "fr",
      commodity: "iron",
      book: "world",
      units: 10,
      unitPrice: 2,
      countryId: "FR",
    },
    {
      id: "us-iron",
      accountId: "mine",
      commodity: "iron",
      book: "world",
      units: 5,
      unitPrice: 2,
      countryId: "US",
    },
  ],
  orders: [
    {
      id: "o",
      accountId: "buyer",
      commodity: "iron",
      book: "world",
      units: 15,
      maximumUnitPrice: 3,
      countryId: "US",
    },
  ],
  fills: [{ orderId: "o", kind: "sale", unitPrice: 2, units: 15, buyerCountry: "US" }],
  tradeCount: 2,
};
const table = { [importTariffKey("iron", "FR", "US")]: 0.5 };
const market = {
  accounts: [
    { id: "buyer", cash: 100 },
    { id: "fr", cash: 20 },
    { id: "mine", cash: 10 },
    { id: "tariff-US", cash: 0 },
  ],
  tradeReceipt: receipt,
} as unknown as EconomyResult;

describe("funded tariffs on the turn", () => {
  it("opens one tariff account per importer with a currency", () => {
    expect(tariffImporters(undefined)).toEqual([]);
    expect(tariffImporters(table)).toEqual(["US"]);
    expect(tariffCollectorScopes(table, (c) => (c === "US" ? "USD" : undefined))).toEqual([
      { kind: "tariffCollector", countryId: "US", currency: "USD" },
    ]);
    expect(tariffCollectorScopes(table, () => undefined)).toEqual([]);
  });

  it("settles the tariff with the market and leaves the books balanced", () => {
    const closingCash = new Map(market.accounts.map((a) => [a.id, a.cash]));
    const close = tariffsAtClose({
      market,
      table,
      collectorOf: (c) => (c === "US" ? "tariff-US" : null),
      closingCash,
    });
    expect(close.transfers).toEqual([
      {
        reason: "import_tariff",
        fromAccountId: "buyer",
        toAccountId: "tariff-US",
        amountAnchor: 10,
      },
    ]);
    expect(closingCash.get("buyer")).toBe(90);
    expect(close.meta).toEqual({ collectedByImporter: { US: 10 }, paid: 10, shortfall: 0 });
    const settled = applySettlementClose(
      market,
      { transfers: close.transfers },
      new Set(market.accounts.map((a) => a.id))
    );
    const cash = new Map(settled.accounts.map((a) => [a.id, a.cash]));
    expect(cash.get("buyer")).toBe(90);
    expect(cash.get("tariff-US")).toBe(10);
    const sum = (rows: readonly { cash: number }[]) => rows.reduce((n, r) => n + r.cash, 0);
    expect(sum(settled.accounts)).toBe(sum(market.accounts));
  });

  it("sweeps each tariff account into Treasury cash, or out where there is no budget", () => {
    const moves = tariffSweepMoves({
      worldEpoch: "w",
      turn: 9,
      collectors: [
        { countryId: "US", walletId: "tariff-US", currency: "USD" },
        { countryId: "FR", walletId: "tariff-FR", currency: "EUR" },
        { countryId: "JP", walletId: "tariff-JP", currency: "JPY" },
      ],
      heldLocal: new Map([
        ["tariff-US", 10],
        ["tariff-FR", 4.5],
      ]),
      budgetIdOf: (c) => (c === "US" ? "federal" : null),
      rateOf: (c) => (c === "EUR" ? 0.9 : 1),
    });
    expect(moves.map((m) => [m.key, m.kind])).toEqual([
      ["producer-tariff-treasury:w:9:US", "producer_tariff_treasury"],
      ["producer-tariff-return:w:9:FR", "producer_tariff_return"],
    ]);
    expect(moves[0].legs[1]).toMatchObject({
      kind: "credit",
      collection: "federalBudget",
      filter: { _id: "federal" },
      path: "treasuryCashLocal",
      amount: 10,
    });
    expect(moves[1].legs[1]).toMatchObject({ kind: "burn", amount: 4.5 });
    for (const move of moves) {
      const legs = producerMoveLedgerLegs(move)!;
      expect(legs).not.toBeNull();
      expect(legs.reduce((n, leg) => n + leg.anchorAmount, 0)).toBeCloseTo(0, 12);
    }
  });

  it("opens a collection account for a country that only levies", () => {
    expect(tariffCollectorScopes(undefined, () => "USD", ["US"])).toEqual([
      { kind: "tariffCollector", countryId: "US", currency: "USD" },
    ]);
  });

  it("collects the automation levy from the company into the treasury with the books balanced", () => {
    // The buyer's input purchase of 30 settled above; its plant owes a 10% levy on it.
    const inputMarket = {
      accounts: market.accounts,
      tradeReceipt: {
        ...receipt,
        orders: [{ ...receipt.orders[0], id: JSON.stringify(["plant-1", "input", "iron"]) }],
        fills: [
          {
            orderId: JSON.stringify(["plant-1", "input", "iron"]),
            kind: "sale",
            unitPrice: 2,
            units: 15,
            buyerCountry: "US",
          },
        ],
      },
    } as unknown as EconomyResult;
    const closingCash = new Map(inputMarket.accounts.map((a) => [a.id, a.cash]));
    const close = automationLevyAtClose({
      market: inputMarket,
      levyByPlant: new Map([["plant-1", { countryId: "US", penalty: 0.1 }]]),
      collectorOf: (c) => (c === "US" ? "tariff-US" : null),
      closingCash,
    });
    expect(close.transfers).toEqual([
      {
        reason: "automation_levy",
        fromAccountId: "buyer",
        toAccountId: "tariff-US",
        amountAnchor: 3,
      },
    ]);
    expect(close.meta).toEqual({ collectedByCountry: { US: 3 }, paid: 3, shortfall: 0 });
    const settled = applySettlementClose(
      inputMarket,
      { transfers: close.transfers },
      new Set(inputMarket.accounts.map((a) => a.id))
    );
    const sum = (rows: readonly { cash: number }[]) => rows.reduce((n, r) => n + r.cash, 0);
    expect(sum(settled.accounts)).toBe(sum(inputMarket.accounts));
    const moves = tariffSweepMoves({
      worldEpoch: "w",
      turn: 9,
      collectors: [{ countryId: "US", walletId: "tariff-US", currency: "USD" }],
      heldLocal: new Map([["tariff-US", 3]]),
      budgetIdOf: () => "federal",
      rateOf: () => 1,
    });
    expect(moves.map((m) => m.key)).toEqual(["producer-tariff-treasury:w:9:US"]);
    const legs = producerMoveLedgerLegs(moves[0])!;
    expect(legs.reduce((n, leg) => n + leg.anchorAmount, 0)).toBeCloseTo(0, 12);
  });
});
