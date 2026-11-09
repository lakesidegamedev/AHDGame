/** Same-state, bounded market replay. Synthetic data only; no database connections. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { routeEligibility } from "../../src/lib/market/producerMarket/routeRules";
import { settleProducerMarket } from "../../src/lib/market/producerMarket/rules";

function equivalent(a: unknown, b: unknown, path = "result"): void {
  if (typeof a === "number" && typeof b === "number") {
    assert(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)), `${path}: ${a} != ${b}`);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), `${path} keys`);
    for (const key of Object.keys(a))
      equivalent(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        `${path}.${key}`
      );
  } else assert(a === b, path);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Supply the baseline rules directory");
  const beforeRoutes = await import(pathToFileURL(resolve(dir, "routeRules.ts")).href);
  const beforeMarket = await import(pathToFileURL(resolve(dir, "rules.ts")).href);
  for (const count of [1000, 4000]) {
    const offers = Array.from({ length: 800 }, (_, i) => ({
      id: `seller:${i}`,
      accountId: `seller:${i}`,
      commodity: "steel",
      book: "world",
      units: 100,
      unitPrice: 1 + (i % 16),
      countryId: `country:${i % 40}`,
      sellerCountry: `country:${i % 40}`,
    }));
    const buyers = Array.from({ length: count }, (_, i) => ({
      id: `buyer:${i}`,
      accountId: `buyer:${i}`,
      commodity: "steel",
      book: "world",
      buyerCountry: `country:${i % 40}`,
      countryId: `country:${i % 40}`,
      units: 100,
      maximumUnitPrice: 20,
      fairShare: true,
    }));
    let calls = 0;
    const open = (_c: string, from: string, to: string) => {
      calls++;
      return !(from === "country:0" && to === "country:1");
    };
    const start = performance.now();
    const oldRoutes = beforeRoutes.routeEligibility(buyers, offers, open);
    const beforeRouteMs = performance.now() - start;
    const beforeRouteCalls = calls;
    calls = 0;
    const routeStart = performance.now();
    const routes = routeEligibility(buyers, offers, open);
    const routeMs = performance.now() - routeStart;
    assert.deepEqual(routes, oldRoutes);
    const input = {
      turn: 1,
      trackCountryBooks: true,
      accounts: [
        ...offers.map((o) => ({ id: o.id, cash: 0 })),
        ...buyers.map((o) => ({ id: o.id, cash: 2000 })),
      ],
      offers,
      orders: buyers.map((o) => ({ ...o, eligibleOfferIds: routes[o.id] })),
    };
    const oldStart = performance.now();
    const oldResult = beforeMarket.settleProducerMarket(input);
    const beforeClearingMs = performance.now() - oldStart;
    const clearStart = performance.now();
    const result = settleProducerMarket(input);
    const clearingMs = performance.now() - clearStart;
    equivalent(result, oldResult);
    assert(calls <= 40 * 39, "Route checks must scale with country pairs, not plants");
    console.log(
      JSON.stringify({
        buyers: count,
        sellers: offers.length,
        equivalentWithinRelativeTolerance: 1e-8,
        beforeRouteCalls,
        routeCalls: calls,
        beforeRouteMs,
        routeMs,
        beforeClearingMs,
        clearingMs,
        peakRssKB: process.resourceUsage().maxRSS,
      })
    );
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
