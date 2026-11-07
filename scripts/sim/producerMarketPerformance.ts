/** Bounded, synthetic same-state qualification. No configured database or player data. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  settleProducerMarket,
  producerTrades,
  type PurchaseOrder,
} from "../../src/lib/market/producerMarket/rules";
import { routeEligibility } from "../../src/lib/market/producerMarket/routeRules";
import {
  encodeReceipt,
  type EncodedReceipt,
} from "../../src/lib/market/producerMarket/receiptStorage";

const baselinePath = process.argv[2];
if (!baselinePath)
  throw new Error("Usage: tsx scripts/sim/producerMarketPerformance.ts <baseline worktree>");

function fixture(count: number) {
  const countries = ["US", "UK", "JP"];
  const offers = Array.from({ length: count / 2 }, (_, i) => ({
    id: `supplier:${i.toString().padStart(24, "0")}`,
    accountId: `seller:${i}`,
    commodity: "steel",
    book: "world",
    units: 100,
    unitPrice: 1 + (i % 8),
    countryId: countries[i % 3],
  }));
  const buyers = Array.from({ length: count }, (_, i) => ({
    id: `order:${i}`,
    commodity: "steel",
    buyerCountry: countries[i % 3],
  }));
  const eligibility = routeEligibility(
    buyers,
    offers.map((s) => ({
      ...s,
      sellerCountry: s.countryId,
    })),
    (_commodity, from, to) => !(from === "US" && to === "JP")
  );
  const orders: PurchaseOrder[] = buyers.map((buyer, i) => ({
    id: buyer.id,
    accountId: `buyer:${Math.floor(i / 4)}`,
    commodity: "steel",
    book: "world",
    countryId: buyer.buyerCountry,
    units: 100,
    maximumUnitPrice: 10,
    fairShare: true,
    priority: 1,
    eligibleOfferIds: eligibility[buyer.id],
    ...(i % 4 < 2 ? { spendGroup: { id: `spend:${Math.floor(i / 4)}`, maximumSpend: 150 } } : {}),
  }));
  return {
    turn: 1,
    trackCountryBooks: true,
    accounts: [
      ...Array.from({ length: count / 4 }, (_, i) => ({ id: `buyer:${i}`, cash: 1000 })),
      ...offers.map((s) => ({ id: s.accountId, cash: 0 })),
    ],
    offers,
    orders,
  };
}

function receiptSize(encoded: EncodedReceipt) {
  return {
    chunks: encoded.chunks.length,
    compressedBytes:
      Buffer.byteLength(encoded.payload) +
      encoded.chunks.reduce((n, c) => n + Buffer.byteLength(c.payload), 0),
    jsonBytes:
      gunzipSync(Buffer.from(encoded.payload, "base64")).length +
      encoded.chunks.reduce((n, c) => n + gunzipSync(Buffer.from(c.payload, "base64")).length, 0),
  };
}

async function main() {
  const oldRules = await import(
    pathToFileURL(resolve(baselinePath, "src/lib/market/producerMarket/rules.ts")).href
  );
  const oldStorage = await import(
    pathToFileURL(resolve(baselinePath, "src/lib/market/producerMarket/receiptStorage.ts")).href
  );
  for (const buyers of [100, 200, 400]) {
    const input = fixture(buyers);
    const oldStart = performance.now();
    const baseline = oldRules.settleProducerMarket(input) as ReturnType<
      typeof settleProducerMarket
    >;
    const baselineMs = performance.now() - oldStart;
    const start = performance.now();
    const candidate = settleProducerMarket(input);
    const candidateMs = performance.now() - start;
    assert.deepEqual(
      candidate,
      baseline,
      "Allocation, cash, prices and country flows must remain identical"
    );
    for (const trade of producerTrades(candidate.tradeReceipt)) {
      assert(!(trade.buyerCountry === "JP" && trade.sellerCountry === "US"), "Embargo violation");
    }
    const encodeStart = performance.now();
    const before = oldStorage.encodeReceipt(baseline) as EncodedReceipt;
    const baselineEncodeMs = performance.now() - encodeStart;
    const candidateStart = performance.now();
    const after = encodeReceipt(candidate);
    const candidateEncodeMs = performance.now() - candidateStart;
    console.log(
      JSON.stringify({
        buyers,
        suppliers: input.offers.length,
        exactMatch: true,
        baselineMs,
        candidateMs,
        baselineEncodeMs,
        candidateEncodeMs,
        baselineReceipt: receiptSize(before),
        candidateReceipt: receiptSize(after),
        peakRssKB: process.resourceUsage().maxRSS,
      })
    );
  }
  // Repeated route lists reproduce the live receipt fan-out without loading a world.
  const routes = Array.from(
    { length: 400 },
    (_, i) => `supplier:${i.toString().padStart(24, "0")}`
  );
  const receipt = {
    orders: Array.from({ length: 3000 }, (_, i) => ({ id: i, eligibleOfferIds: routes })),
  };
  const oldStart = performance.now();
  const before = oldStorage.encodeReceipt(receipt) as EncodedReceipt;
  const baselineEncodeMs = performance.now() - oldStart;
  const start = performance.now();
  const after = encodeReceipt(receipt);
  console.log(
    JSON.stringify({
      repeatedRoutes: 3000,
      suppliers: 400,
      baselineEncodeMs,
      candidateEncodeMs: performance.now() - start,
      baselineReceipt: receiptSize(before),
      candidateReceipt: receiptSize(after),
      peakRssKB: process.resourceUsage().maxRSS,
    })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
