/** Offline, single-turn market replay. Fixtures and reports must remain outside the repository. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { advanceProducerEconomy } from "../../src/lib/market/producerMarket/production";

type Request = Parameters<typeof advanceProducerEconomy>[0];
type Result = ReturnType<typeof advanceProducerEconomy>;

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
  const request = (JSON.parse(fixture.toString()) as { request: Request }).request;
  // JSON cannot retain the host's country lookup callback. Reconstruct it from
  // the same frozen state's household books, never current production data.
  const countries = new Map<string, string>();
  for (const household of request.households ?? []) {
    if (!household.stateId || !household.countryId) continue;
    const previous = countries.get(household.stateId);
    if (previous && previous !== household.countryId) throw new Error("Ambiguous frozen country");
    countries.set(household.stateId, household.countryId);
  }
  const producerCountries = new Map(
    request.producers.map((p) => [p.id, countries.get(p.stateId ?? "")])
  );
  if ([...producerCountries.values()].some((country) => !country))
    throw new Error("Incomplete frozen countries");
  const engineModule = (await import(pathToFileURL(engine).href)) as {
    advanceProducerEconomy: typeof advanceProducerEconomy;
  };
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const result: Result = engineModule.advanceProducerEconomy(
    {
      ...request,
      maximumPlanningPasses: passes,
      countryOfProducer: (id) => producerCountries.get(id),
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Producer planning simulation failed");
  process.exitCode = 1;
});
