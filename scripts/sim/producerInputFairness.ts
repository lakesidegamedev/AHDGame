/** Offline input-market replay; private frozen receipts and reports stay outside the repository. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { producerPlanningReplayRequest } from "./producerPlanningConvergence";
import { producerInputBidLimit } from "../../src/lib/market/producerMarket/inputBidRules";
import { laneKeyOf } from "../../src/lib/market/producerMarket/laneKey";
import type { advanceProducerEconomy } from "../../src/lib/market/producerMarket/production";

type Request = Parameters<typeof advanceProducerEconomy>[0];

/** Recover independent references from same-country output quotes, never from the new bid. */
export function replayInputBidHeadroom(
  request: Request,
  headroom = 1.25,
  countries?: ReadonlySet<string>
): Request {
  const references = new Map<string, number>();
  const key = (p: Request["producers"][number], book: string, commodity: string) =>
    JSON.stringify([request.countryOfProducer?.(p.id), book, commodity]);
  for (const p of request.producers) {
    for (const o of p.outputs) {
      if (o.book !== "world") continue;
      const id = key(p, o.book, o.commodity);
      const prior = references.get(id);
      if (prior != null && Math.abs(prior - o.referenceUnitPrice) > 1e-7 * Math.max(1, prior))
        throw new Error(
          `Ambiguous frozen input reference ${id}: ${prior} / ${o.referenceUnitPrice}`
        );
      references.set(id, o.referenceUnitPrice);
    }
  }
  return {
    ...request,
    producers: request.producers.map((p) => ({
      ...p,
      inputs: p.inputs.map((i) => {
        if (i.book !== "world") return i;
        if (countries && !countries.has(request.countryOfProducer?.(p.id) ?? "")) return i;
        const cleared = request.clearingPriceByLane?.[laneKeyOf(i.commodity, i.book)];
        let reference = references.get(key(p, i.book, i.commodity));
        // A bid above yesterday's clearing cannot be clearing-floor dominated.
        if (reference == null && (cleared == null || i.maximumUnitPrice > cleared))
          reference = i.maximumUnitPrice / headroom;
        if (reference == null && cleared != null && i.maximumUnitPrice < cleared)
          reference = i.maximumUnitPrice / 3;
        if (reference == null)
          throw new Error(`Missing frozen input reference ${key(p, i.book, i.commodity)}`);
        const oldBid = Math.max(
          reference * headroom,
          cleared != null && cleared > reference ? Math.min(cleared, reference * 3) : 0
        );
        if (Math.abs(oldBid - i.maximumUnitPrice) > 1e-7 * Math.max(1, oldBid))
          throw new Error(
            `Frozen input bid does not match the source rule ${key(p, i.book, i.commodity)}: reference ${reference}, clearing ${cleared}, expected ${oldBid}, actual ${i.maximumUnitPrice}`
          );
        return {
          ...i,
          maximumUnitPrice: producerInputBidLimit({
            referenceUnitPrice: reference,
            headroom,
            clearingUnitPrice: cleared,
          }),
        };
      }),
    })),
  };
}

const option = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

async function main() {
  const inputPath = option("--input"),
    outputPath = option("--out");
  if (!inputPath || !outputPath) throw new Error("Supply private --input and --out paths");
  const bytes = readFileSync(inputPath);
  const frozen = JSON.parse(bytes.toString()) as Parameters<
    typeof producerPlanningReplayRequest
  >[0];
  let request = producerPlanningReplayRequest(frozen);
  const bidCountries = option("--bid-countries")?.split(",");
  if (process.argv.includes("--bids"))
    request = replayInputBidHeadroom(
      request,
      1.25,
      bidCountries ? new Set(bidCountries) : undefined
    );
  request.maximumPlanningPasses = Number(option("--passes") ?? 16);
  const enginePath = path.resolve(
    option("--engine") ?? "src/lib/market/producerMarket/production.ts"
  );
  const engine = (await import(pathToFileURL(enginePath).href)) as {
    advanceProducerEconomy: typeof advanceProducerEconomy;
  };
  const started = performance.now(),
    cpuStarted = process.cpuUsage();
  const result = engine.advanceProducerEconomy(request);
  const elapsedMs = performance.now() - started,
    cpu = process.cpuUsage(cpuStarted);
  const openingCash = request.accounts.reduce((sum, a) => sum + a.cash, 0);
  const closingCash = result.accounts.reduce((sum, a) => sum + a.cash, 0);
  if (Math.abs(openingCash - closingCash) > Math.max(1e-3, openingCash * 1e-12))
    throw new Error("Cash conservation failed");
  if (result.producers.some((p) => !Number.isFinite(p.producedUnits) || p.producedUnits < 0))
    throw new Error("Invalid production");
  const old = new Map(
    (frozen.result as ReturnType<typeof advanceProducerEconomy> | undefined)?.producers.map((p) => [
      p.id,
      p,
    ])
  );
  const plans = new Map(request.producers.map((p) => [p.id, p]));
  const sites = result.producers.map((p) => {
    const plan = plans.get(p.id)!;
    const reference = plan.outputs.reduce(
      (sum, o) => sum + o.unitsPerOutput * o.referenceUnitPrice,
      0
    );
    return {
      id: p.id,
      country: request.countryOfProducer?.(p.id),
      units: p.producedUnits,
      planned: p.plannedUnits,
      revenue: p.revenue,
      profit: p.profit,
      cut: p.runCutBy,
      binding: p.bindingInput,
      referenceOutput: p.producedUnits * reference,
      change: p.producedUnits - (old.get(p.id)?.producedUnits ?? p.producedUnits),
    };
  });
  const report = {
    turn: request.turn,
    fixtureSha256: createHash("sha256").update(bytes).digest("hex"),
    engineSha256: createHash("sha256").update(readFileSync(enginePath)).digest("hex"),
    allocationSha256: createHash("sha256")
      .update(readFileSync(path.join(path.dirname(enginePath), "rules.ts")))
      .update(readFileSync(path.join(path.dirname(enginePath), "publicFairShareRules.ts")))
      .digest("hex"),
    bidRuleSha256: createHash("sha256")
      .update(
        readFileSync(
          new URL("../../src/lib/market/producerMarket/inputBidRules.ts", import.meta.url)
        )
      )
      .digest("hex"),
    bidHeadroom: process.argv.includes("--bids"),
    bidCountries: bidCountries ?? "all",
    passes: request.maximumPlanningPasses,
    elapsedMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    openingCash,
    closingCash,
    planning: result.planning,
    sites,
    orders: result.tradeReceipt.orders,
    fills: result.tradeReceipt.fills,
  };
  writeFileSync(outputPath, JSON.stringify(report));
  console.log(
    JSON.stringify({
      turn: report.turn,
      bidHeadroom: report.bidHeadroom,
      passes: report.passes,
      elapsedMs,
      peakRssMiB: report.peakRssMiB,
      stop: result.planning?.stopReason,
      changingSites: result.planning?.siteChanges.length,
      site: sites.find((p) => p.id === option("--site")),
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : "Replay failed");
    process.exitCode = 1;
  });
