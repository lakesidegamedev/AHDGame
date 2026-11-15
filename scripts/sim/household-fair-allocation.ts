/** Deterministic household-allocation qualification; optional read-only captured book replay. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { COUNTRY_ORDER } from "../../src/lib/constants/countriesCore";
import { householdPurchaseOrders } from "../../src/lib/market/producerMarket/householdRules";
import { producerTrades, settleProducerMarket } from "../../src/lib/market/producerMarket/rules";

type Input = Parameters<typeof settleProducerMarket>[0];
const countries = [...new Set([...COUNTRY_ORDER, "SCO", "WAL"])];
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) <= Math.max(1e-7, Math.abs(b) * 1e-9), `${a} != ${b}`);
function qualify(input: Input) {
  const baselineStart = performance.now();
  const before = settleProducerMarket({
    ...input,
    orders: input.orders.map((o) => ({ ...o, fairShare: false })),
  });
  const baselineMs = performance.now() - baselineStart;
  const start = performance.now();
  const after = settleProducerMarket({
    ...input,
    orders: input.orders.map((o) => ({ ...o, fairShare: true })),
  });
  const ms = performance.now() - start;
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  for (const result of [before, after]) {
    close(
      result.accounts.reduce((n, a) => n + a.cash, 0),
      input.accounts.reduce((n, a) => n + a.cash, 0)
    );
    assert.ok(result.accounts.every((a) => a.cash >= -1e-8));
    for (const trade of producerTrades(result.tradeReceipt)) {
      const o = orderById.get(trade.orderId)!;
      assert.ok(
        !o.eligibleOfferIds || o.eligibleOfferIds.includes(trade.offerId),
        "Embargo route escaped"
      );
      assert.ok(trade.unitPrice <= o.maximumUnitPrice + 1e-8, "Price ceiling escaped");
    }
    for (const o of result.orders) {
      assert.ok(o.deliveredUnits <= orderById.get(o.id)!.units + 1e-7);
      assert.ok(o.cost <= (orderById.get(o.id)!.maximumSpend ?? Infinity) + 1e-7);
    }
  }
  const sum = (r: typeof after) => r.orders.reduce((n, o) => n + o.deliveredUnits, 0);
  const byCountry = (r: typeof after, c: string) =>
    r.orders
      .filter((o) => orderById.get(o.id)?.countryId === c)
      .reduce((n, o) => n + o.deliveredUnits, 0);
  return { before, after, ms, baselineMs, sum, byCountry };
}

const synthetic = [];
for (const regions of [1, 8, 32]) {
  const orders = countries.flatMap((countryId) =>
    Array.from({ length: regions }, (_, i) =>
      householdPurchaseOrders({
        countryId,
        stateId: `${countryId}-${i}`,
        accountId: `${countryId}:${i}`,
        cash: 100 / regions,
        spendFraction: 1,
        products: [
          {
            commodity: "network_services",
            book: "world",
            maximumUnitPrice: 1,
            weight: 1,
            eligibleOfferIds: ["open"],
          },
        ],
      })
    ).flat()
  );
  const input: Input = {
    turn: 1,
    orders,
    accounts: [
      { id: "supplier", cash: 0 },
      ...orders.map((o) => ({ id: o.accountId, cash: 100 / regions })),
    ],
    offers: [
      {
        id: "open",
        accountId: "supplier",
        commodity: "network_services",
        countryId: "DE",
        book: "world",
        units: countries.length * 30,
        unitPrice: 1,
      },
    ],
  };
  const r = qualify(input);
  for (const c of countries) close(r.byCountry(r.after, c), 30);
  close(r.sum(r.before), r.sum(r.after));
  const reversed = settleProducerMarket({ ...input, orders: [...orders].reverse() });
  assert.deepEqual(reversed.orders, r.after.orders);
  synthetic.push({
    countries: countries.length,
    regionsPerCountry: regions,
    orders: orders.length,
    deliveredPerCountry: 30,
    baselineUs: r.byCountry(r.before, "US"),
    fairUs: r.byCountry(r.after, "US"),
    baselineClearingMs: Number(r.baselineMs.toFixed(2)),
    fairClearingMs: Number(r.ms.toFixed(2)),
  });
}

// A forbidden buyer has real money and demand but no authorized supplier.
const embargoRoutes = new Map<string, string[]>([
  ["US", ["west"]],
  ["UK", ["west", "east"]],
  ["JP", []],
]);
const embargoOrders = [...embargoRoutes].flatMap(([countryId, eligibleOfferIds]) =>
  householdPurchaseOrders({
    countryId,
    accountId: countryId,
    cash: 100,
    spendFraction: 1,
    products: [
      {
        commodity: "network_services",
        book: "world",
        weight: 1,
        maximumUnitPrice: 1,
        eligibleOfferIds,
      },
    ],
  })
);
const embargo = qualify({
  turn: 1,
  orders: embargoOrders,
  accounts: [{ id: "seller", cash: 0 }, ...["US", "UK", "JP"].map((id) => ({ id, cash: 100 }))],
  offers: [
    {
      id: "west",
      accountId: "seller",
      commodity: "network_services",
      book: "world",
      countryId: "DE",
      units: 20,
      unitPrice: 1,
    },
    {
      id: "east",
      accountId: "seller",
      commodity: "network_services",
      book: "world",
      countryId: "RU",
      units: 20,
      unitPrice: 1,
    },
  ],
});
close(embargo.byCountry(embargo.after, "US"), 10);
close(embargo.byCountry(embargo.after, "UK"), 30);
close(embargo.byCountry(embargo.after, "JP"), 0);

let captured;
const index = process.argv.indexOf("--snapshot");
if (index >= 0) {
  const input = JSON.parse(readFileSync(process.argv[index + 1], "utf8")) as Input;
  const r = qualify(input);
  close(r.sum(r.before), r.sum(r.after));
  for (const c of ["US", "UK"]) assert.ok(r.byCountry(r.after, c) > 0, `${c} still starved`);
  captured = {
    turn: input.turn,
    scope:
      "Frozen Network Services offers and buyer orders only; isolated basket budgets, no full-turn replay",
    orders: input.orders.length,
    offers: input.offers.length,
    beforeDelivered: r.sum(r.before),
    afterDelivered: r.sum(r.after),
    baselineClearingMs: Number(r.baselineMs.toFixed(2)),
    fairClearingMs: Number(r.ms.toFixed(2)),
    selected: ["US", "UK", "JP"].map((country) => ({
      country,
      beforeDaily: r.byCountry(r.before, country) * 24,
      afterDaily: r.byCountry(r.after, country) * 24,
    })),
  };
}
console.log(
  JSON.stringify(
    { verdict: "passed", synthetic, embargoEnforced: true, cashConserved: true, captured },
    null,
    2
  )
);
