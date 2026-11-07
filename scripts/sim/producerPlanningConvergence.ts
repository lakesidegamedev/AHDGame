/** Offline, single-turn market replay. Fixtures and reports must remain outside the repository. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { advanceProducerEconomy } from "../../src/lib/market/producerMarket/production";

type Request = Parameters<typeof advanceProducerEconomy>[0];
type Result = ReturnType<typeof advanceProducerEconomy>;

/** Restore the callback JSON drops, using only attribution in the frozen fixture. */
export function producerPlanningReplayRequest(frozen: {
  request: Request;
  result?: Pick<Result, "tradeReceipt">;
}): Request {
  const { request } = frozen;
  const offers = new Map(frozen.result?.tradeReceipt.offers.map((offer) => [offer.id, offer]));
  const orders = new Map(frozen.result?.tradeReceipt.orders.map((order) => [order.id, order]));
  const countriesByWallet = new Map<string, Set<string>>();
  const countriesByState = new Map<string, Set<string>>();
  const addCountry = (index: Map<string, Set<string>>, key: string, country: string) => {
    const countries = index.get(key) ?? new Set<string>();
    countries.add(country);
    index.set(key, countries);
  };
  for (const household of request.households ?? []) {
    if (!household.countryId) continue;
    addCountry(countriesByWallet, household.accountId, household.countryId);
    if (household.stateId) addCountry(countriesByState, household.stateId, household.countryId);
  }
  const producerCountries = new Map<string, string | undefined>();
  for (const producer of request.producers) {
    // Receipt rows retain the original callback's result, including an absent
    // country. Prefer them to household inference, even when they are untagged.
    const rows = [
      ...producer.outputs.map((output) =>
        offers.get(JSON.stringify([producer.id, "output", output.commodity]))
      ),
      ...producer.inputs.map((input) =>
        orders.get(JSON.stringify([producer.id, "input", input.commodity]))
      ),
    ].filter((row) => row != null);
    const countries = new Set(
      rows.length > 0
        ? rows.map((row) => row.countryId)
        : [
            ...(countriesByWallet.get(producer.labourRecipientAccountId) ?? []),
            ...(countriesByState.get(producer.stateId ?? "") ?? []),
          ]
    );
    if (countries.size > 1) throw new Error(`Ambiguous frozen country for producer ${producer.id}`);
    producerCountries.set(producer.id, countries.values().next().value);
  }
  return { ...request, countryOfProducer: (id) => producerCountries.get(id) };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const inputPath = option("--input");
  const outputPath = option("--out");
  if (!inputPath || !outputPath) throw new Error("Supply --input and --out outside the repository");
  const passes = Number(option("--passes") ?? 64);
  const budget = option("--budget-ms");
  const engine = path.resolve(option("--engine") ?? "src/lib/market/producerMarket/production.ts");
  const fixture = readFileSync(inputPath);
  const request = producerPlanningReplayRequest(
    JSON.parse(fixture.toString()) as Parameters<typeof producerPlanningReplayRequest>[0]
  );
  const engineModule = (await import(pathToFileURL(engine).href)) as {
    advanceProducerEconomy: typeof advanceProducerEconomy;
  };
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const result: Result = engineModule.advanceProducerEconomy(
    {
      ...request,
      maximumPlanningPasses: passes,
    },
    budget == null
      ? undefined
      : {
          maximumElapsedMs: Number(budget),
          elapsedMs: () => performance.now() - started,
        }
  );
  const elapsedMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStarted);
  const weights = new Map(
    request.producers.map((p) => [
      p.id,
      p.outputs.reduce((sum, output) => sum + output.unitsPerOutput * output.referenceUnitPrice, 0),
    ])
  );
  const sites = result.producers.map((p) => ({
    id: p.id,
    units: p.producedUnits,
    value: p.producedUnits * weights.get(p.id)!,
  }));
  const openingCash = request.accounts.reduce((sum, a) => sum + a.cash, 0);
  const closingCash = result.accounts.reduce((sum, a) => sum + a.cash, 0);
  if (Math.abs(openingCash - closingCash) > Math.max(1e-3, openingCash * 1e-12))
    throw new Error("Cash conservation failed");
  if (result.producers.some((p) => !Number.isFinite(p.producedUnits) || p.producedUnits < 0))
    throw new Error("Invalid output");
  const baselinePath = option("--baseline");
  const baseline = baselinePath
    ? (JSON.parse(readFileSync(baselinePath, "utf8")) as {
        fixtureHash: string;
        sites: typeof sites;
        referenceOutput: number;
      })
    : undefined;
  const fixtureHash = createHash("sha256").update(fixture).digest("hex");
  if (baseline && baseline.fixtureHash !== fixtureHash) throw new Error("Baseline fixture differs");
  const previous = new Map(baseline?.sites.map((p) => [p.id, p]) ?? []);
  if (baseline && (previous.size !== sites.length || sites.some((p) => !previous.has(p.id))))
    throw new Error("Baseline site identities differ");
  const referenceOutput = sites.reduce((sum, p) => sum + p.value, 0);
  const report = {
    turn: request.turn,
    fixtureHash,
    engineHash: createHash("sha256").update(readFileSync(engine)).digest("hex"),
    passes,
    budgetMs: budget == null ? null : Number(budget),
    producers: sites.length,
    elapsedMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    receiptBytes: Buffer.byteLength(JSON.stringify(result)),
    referenceOutput,
    revenue: result.producers.reduce((sum, p) => sum + p.revenue, 0),
    planning: result.planning,
    openingCash,
    closingCash,
    comparison: baseline
      ? {
          outputDifferencePercent:
            (100 * (referenceOutput - baseline.referenceOutput)) / baseline.referenceOutput,
          changedSites: sites.filter(
            (p) => Math.abs(p.units - (previous.get(p.id)?.units ?? NaN)) > 1e-6
          ).length,
          grossUnderPercent:
            (100 *
              sites.reduce((sum, p) => sum + Math.max(0, previous.get(p.id)!.value - p.value), 0)) /
            baseline.referenceOutput,
          grossOverPercent:
            (100 *
              sites.reduce((sum, p) => sum + Math.max(0, p.value - previous.get(p.id)!.value), 0)) /
            baseline.referenceOutput,
        }
      : undefined,
    sites,
  };
  writeFileSync(outputPath, JSON.stringify(report));
  const { sites: _sites, planning, ...summary } = report;
  console.log(
    JSON.stringify({
      ...summary,
      planning: planning && { ...planning, siteChanges: planning.siteChanges.length },
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Producer planning simulation failed");
    process.exitCode = 1;
  });
}
