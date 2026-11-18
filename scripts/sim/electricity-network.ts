/** Synthetic loss/capacity comparison. No database or player data. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { advanceProducerEconomy } from "../../src/lib/market/producerMarket/production";
import { producerTrades } from "../../src/lib/market/producerMarket/producerQuotes";
import type { ProducerEconomyInput } from "../../src/lib/market/producerMarket/productionTypes";
import type { ProductionPlan } from "../../src/lib/market/producerMarket/production";
import type { ElectricityNetworkMode } from "../../src/lib/electricityNetwork/rules/types";
const plan = (id: string, price: number): ProductionPlan => ({
  id,
  accountId: id,
  stateId: id === "us" ? "CT" : "TOK",
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 5,
  otherOperatingCost: 0,
  labourRecipientAccountId: "buyer",
  operatingRecipientAccountId: "buyer",
  inputs: [],
  outputs: [
    {
      commodity: "energy",
      book: "world",
      unitsPerOutput: 1,
      policy: { kind: "manual", unitPrice: price },
      referenceUnitPrice: price,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
});
const started = performance.now();
const results = (["off", "shadow", "enforced"] as const).map((mode: ElectricityNetworkMode) => {
  let accounts = [
    { id: "us", cash: 1000 },
    { id: "jp", cash: 1000 },
    { id: "buyer", cash: 1000000 },
  ];
  let delivered = 0,
    dispatched = 0,
    paid = 0,
    losses = 0;
  const initial = accounts.reduce((s, a) => s + a.cash, 0);
  for (let turn = 1; turn <= 48; turn++) {
    const input: ProducerEconomyInput = {
      turn,
      accounts,
      maximumPlanningPasses: 4,
      producers: [plan("us", 2), plan("jp", 1)],
      countryOfProducer: (id) => (id === "us" ? "US" : "JP"),
      externalOrders: [
        {
          id: "canadian-demand",
          accountId: "buyer",
          commodity: "energy",
          book: "world",
          countryId: "CA",
          stateId: "CA_ON",
          units: 80,
          maximumUnitPrice: 5,
          fairShare: true,
        },
      ],
      electricityNetwork: {
        version: "synthetic",
        year: 2027,
        mode,
        notes: [],
        links: [
          {
            id: "tie",
            name: "Synthetic tie",
            source: "synthetic",
            from: "US",
            to: "CA",
            capacity: 30,
            loss: 0.1,
          },
        ],
      },
    };
    const result = advanceProducerEconomy(input);
    assert.deepEqual(
      advanceProducerEconomy(input),
      result,
      "Identical retry must reproduce the same result"
    );
    const trades = [...producerTrades(result.tradeReceipt)];
    assert.equal(trades.length, result.tradeReceipt.tradeCount);
    const received = trades.reduce((s, t) => s + t.units, 0),
      sent = trades.reduce((s, t) => s + (t.dispatchedUnits ?? t.units), 0);
    if (mode === "enforced") {
      assert(sent <= 30 + 1e-7);
      assert(received <= 27 + 1e-7);
      assert(trades.every((t) => t.sellerCountry === "US"));
      assert(Math.abs(sent - received - (result.electricity?.losses ?? 0)) < 1e-7);
    }
    accounts = result.accounts;
    assert(
      Math.abs(accounts.reduce((s, a) => s + a.cash, 0) - initial) < 1e-7,
      "Cash conservation"
    );
    delivered += received;
    dispatched += sent;
    losses += sent - received;
    paid += trades.reduce((s, t) => s + t.amount, 0);
  }
  return {
    mode,
    turns: 48,
    delivered,
    dispatched,
    losses,
    paid,
    closingCash: accounts.reduce((s, a) => s + a.cash, 0),
  };
});
assert.deepEqual(
  { ...results[0], mode: "shadow" },
  results[1],
  "Shadow must not alter live settlement"
);
console.log(
  JSON.stringify(
    {
      fixture: "Synthetic US/JP suppliers and Canadian buyer; 30 MWh tie, 10% loss",
      elapsedMs: performance.now() - started,
      results,
    },
    null,
    2
  )
);
