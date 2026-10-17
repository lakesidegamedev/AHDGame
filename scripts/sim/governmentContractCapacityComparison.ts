/**
 * Reproducible paired kernel experiment, not full-world qualification.
 * npx tsx scripts/sim/governmentContractCapacityComparison.ts <external-report-directory>
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { getStateResourceCapacity } from "../../src/lib/seeds/reference/stateResourceCapacity";
import { eraScaledBasePrices, type ExtractableResource } from "../../src/lib/constants/commodities";
import { getEraUnitScale } from "../../src/lib/constants/sectorSeedEra";
import { productionKernels } from "./governmentContractBalance/kernels";
import { paths, schedule, simulate, type Policy } from "./governmentContractBalance/model";
const out = process.argv[2];
if (!out) throw new Error("An external report directory is required.");
const reportDir = resolve(out),
  repo = resolve(".");
assert(
  !reportDir.startsWith(repo + "\\") && !reportDir.startsWith(repo + "/") && reportDir !== repo,
  "Put reports outside the repository."
);
mkdirSync(reportDir, { recursive: true });
const kernels = productionKernels();
type Result = ReturnType<typeof simulate>;
function accumulator() {
  return {
    cases: 0,
    issuable: 0,
    awarded: 0,
    defaults: 0,
    rational: 0,
    sustainable: 0,
    sustainableRevenue: 0,
    fullTermOutputCases: 0,
    fullTermOutputDelta: 0,
    idleCharged: 0,
    sumGovernment: 0,
    sumWealthDelta: 0,
    sumMaxFee: 0,
    outputCases: 0,
    sumOutputDeltaPct: 0,
    otherCases: 0,
    sumOtherDeltaPct: 0,
    maxTransferError: 0,
  };
}
const totals = new Map<string, ReturnType<typeof accumulator>>();
function aggregate(key: string, r: Result, share: number, issuable: boolean) {
  const a = totals.get(key) ?? accumulator();
  a.cases++;
  a.issuable += +issuable;
  a.awarded += +r.awarded;
  a.defaults += +(r.defaultTurn !== null);
  a.rational += +r.rational;
  a.sustainable += +r.sustainable;
  if (r.sustainable) a.sustainableRevenue += r.governmentRevenue / share;
  if (r.fullTermOutputDeltaPercent != null) {
    a.fullTermOutputCases++;
    a.fullTermOutputDelta += r.fullTermOutputDeltaPercent;
  }
  a.idleCharged += +(r.idlePaid > 0);
  a.sumGovernment += r.governmentRevenue / share;
  a.sumWealthDelta += r.wealthDelta / share;
  a.sumMaxFee += r.maxEconomicFee / share;
  const control = r.controlOutput + r.controlOtherOutput;
  if (control > 0) {
    a.outputCases++;
    a.sumOutputDeltaPct += (100 * r.totalOutputDelta) / control;
  }
  if (r.controlOtherOutput > 0) {
    a.otherCases++;
    a.sumOtherDeltaPct += (100 * (r.otherOutput - r.controlOtherOutput)) / r.controlOtherOutput;
  }
  a.maxTransferError = Math.max(a.maxTransferError, r.transferIdentityError);
  totals.set(key, a);
}
const params = {
  shares: [0.01, 0.1, 0.75],
  holderDemandFractions: [0.01, 0.1, 0.5],
  terms: [24, 168, 480],
  royaltyRates: [0, 0.001, 0.005, 0.01, 0.02],
  contributionMargins: [0.1, 0.25, 0.5],
  cashRunwayGrossTurns: [0, 24, 96],
  signingFeeQuotaGrossDays: [0, 0.1],
  baselineWindow: 24,
  startupFloor: 0.1,
};
const csv = join(reportDir, "arms.csv");
const columns = [
  "path",
  "policy",
  "share",
  "holderFraction",
  "term",
  "rate",
  "margin",
  "runway",
  "feeDays",
  "recentOutput",
  "reservedDaily",
  "awarded",
  "defaultTurn",
  "rational",
  "sustainable",
  "fullTermOutputDeltaPercent",
  "maxEconomicFee",
  "governmentRevenue",
  "wealthDelta",
  "holderOutput",
  "controlOutput",
  "otherOutput",
  "controlOtherOutput",
  "totalOutputDelta",
  "idlePaid",
  "royaltyGrossRatio",
  "transferIdentityError",
];
writeFileSync(csv, columns.join(",") + "\n");
let buffer: string[] = [],
  arms = 0,
  turns = 0;
const examples: unknown[] = [];
for (const path of paths)
  for (const share of params.shares)
    for (const fraction of params.holderDemandFractions)
      for (const term of params.terms)
        for (const baseline of ["capacity", "recent", "recent-floor"] as const) {
          const s = schedule(
            path,
            baseline,
            share,
            fraction,
            term,
            kernels,
            params.baselineWindow,
            params.startupFloor
          );
          for (const royalty of ["capacity", "allocation", "production"] as const)
            for (const rate of params.royaltyRates)
              for (const margin of params.contributionMargins)
                for (const runway of params.cashRunwayGrossTurns)
                  for (const feeDays of params.signingFeeQuotaGrossDays) {
                    const policy: Policy = {
                      baseline,
                      royalty,
                      floor: baseline === "recent-floor" ? params.startupFloor : 0,
                    };
                    const name = policy.baseline + "/" + policy.royalty;
                    const r = simulate(s, { royalty, rate, margin, runway, feeDays });
                    arms++;
                    turns += s.frames.length;
                    assert(r.transferIdentityError < 1e-8, "Transfer conservation failed.");
                    assert(
                      r.holderOutput >= 0 && r.otherOutput >= 0 && r.paid <= r.due + 1e-10,
                      "Invalid output or royalty."
                    );
                    aggregate(name, r, share, s.issuable);
                    if (s.recentOutput > 0) aggregate("common:" + name, r, share, s.issuable);
                    aggregate(path.name + "|" + name, r, share, s.issuable);
                    buffer.push(
                      [
                        path.name,
                        name,
                        share,
                        fraction,
                        term,
                        rate,
                        margin,
                        runway,
                        feeDays,
                        s.recentOutput,
                        s.reservedDaily,
                        r.awarded,
                        r.defaultTurn ?? "",
                        r.rational,
                        r.sustainable,
                        r.fullTermOutputDeltaPercent ?? "",
                        r.maxEconomicFee,
                        r.governmentRevenue,
                        r.wealthDelta,
                        r.holderOutput,
                        r.controlOutput,
                        r.otherOutput,
                        r.controlOtherOutput,
                        r.totalOutputDelta,
                        r.idlePaid,
                        r.royaltyGrossRatio ?? "",
                        r.transferIdentityError,
                      ].join(",")
                    );
                    if (buffer.length >= 2000) {
                      appendFileSync(csv, buffer.join("\n") + "\n");
                      buffer = [];
                    }
                    if (
                      share === 0.1 &&
                      fraction === 0.1 &&
                      term === 168 &&
                      rate === 0.01 &&
                      margin === 0.25 &&
                      runway === 24 &&
                      feeDays === 0
                    )
                      examples.push({
                        path: path.name,
                        policy: name,
                        recentOutput: s.recentOutput,
                        reservedDaily: s.reservedDaily,
                        ...r,
                      });
                  }
        }
if (buffer.length) appendFileSync(csv, buffer.join("\n") + "\n");
const sensitivities: unknown[] = [];
for (const path of paths)
  for (const window of [6, 12, 24, 48])
    for (const floor of [0, 0.01, 0.1, 0.25])
      for (const royalty of ["allocation", "production"] as const) {
        const s = schedule(path, "recent-floor", 0.1, 0.1, 168, kernels, window, floor);
        sensitivities.push({
          path: path.name,
          window,
          floor,
          royalty,
          recentOutput: s.recentOutput,
          reservedDaily: s.reservedDaily,
          ...simulate(s, { royalty, rate: 0.01, margin: 0.25, runway: 24, feeDays: 0 }),
        });
      }
const fixtureSpecs = [
  ["1953-default", "US:MN", "iron"],
  ["1991-default", "US:MN", "iron"],
  ["2019-default", "US:MN", "iron"],
  ["1991-default", "US:TX", "oil"],
  ["2019-default", "UK:SCO", "oil"],
  ["1991-default", "US:WV", "coal"],
  ["2019-default", "US:OR", "timber"],
] as const;
const fixtures = fixtureSpecs.map(([preset, state, resource]) => {
  const capacity =
    getStateResourceCapacity(preset)[state].resources[resource as ExtractableResource]!;
  const price = eraScaledBasePrices(getEraUnitScale(preset))[resource];
  assert(capacity > 0 && price > 0);
  const k = productionKernels(resource, capacity, price);
  const a = simulate(schedule(paths[0], "capacity", 0.1, 0.1, 168, k), {
    royalty: "capacity",
    rate: 0.01,
    margin: 0.25,
    runway: 24,
    feeDays: 0,
  });
  const b = simulate(schedule(paths[0], "capacity", 0.1, 0.1, 168, kernels), {
    royalty: "capacity",
    rate: 0.01,
    margin: 0.25,
    runway: 24,
    feeDays: 0,
  });
  assert(Math.abs(a.wealthDelta - b.wealthDelta) < 1e-9);
  return {
    preset,
    state,
    resource,
    capacityDailyUnits: capacity,
    priceAnchorPerUnit: price,
    totalCapacityDailyValueAnchor: capacity * price,
    tenPercentDailyValueAnchor: 0.1 * capacity * price,
    onePercentRoyaltyPerTurnAnchor: 0.01 * 0.1 * capacity * price,
  };
});
function summarize([key, a]: [string, ReturnType<typeof accumulator>]) {
  return {
    key,
    ...a,
    defaultPercent: a.awarded ? (100 * a.defaults) / a.awarded : null,
    rationalPercent: (100 * a.rational) / a.cases,
    sustainablePercent: (100 * a.sustainable) / a.cases,
    meanFullTermOutputDeltaPercent: a.fullTermOutputCases
      ? a.fullTermOutputDelta / a.fullTermOutputCases
      : null,
    meanSustainableGovernmentQuotaGrossDays: a.sustainableRevenue / a.cases,
    meanGovernmentQuotaGrossDays: a.sumGovernment / a.cases,
    meanWealthDeltaQuotaGrossDays: a.sumWealthDelta / a.cases,
    meanMaxFeeQuotaGrossDays: a.sumMaxFee / a.cases,
    meanStateOutputDeltaPercent: a.outputCases ? a.sumOutputDeltaPct / a.outputCases : null,
    meanOtherMinersOutputDeltaPercent: a.otherCases ? a.sumOtherDeltaPct / a.otherCases : null,
  };
}
const sourcePaths = [
  "scripts/sim/governmentContractCapacityComparison.ts",
  "scripts/sim/governmentContractBalance/model.ts",
  "scripts/sim/governmentContractBalance/kernels.ts",
  "src/lib/turn/extraction/extractionCapacity.ts",
  "src/lib/turn/extraction/contractSettlement.ts",
  "src/lib/constants/prospecting.ts",
  "src/lib/constants/corporations.ts",
  "src/lib/constants/commodities.ts",
  "src/lib/constants/sectorSeedEra.ts",
  "src/lib/seeds/reference/stateResourceCapacity.ts",
];
const summary = {
  scope: "paired production-kernel stress simulation, no database and no production changes",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  worktreeDirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  sources: sourcePaths.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
  runtime: process.version,
  arms,
  financialTurnSteps: turns,
  sensitivityArms: sensitivities.length,
  params,
  paths: paths.map((p) => p.name),
  methodology: [
    "Compare identical exogenous desired-output and price paths with no-contract open access.",
    "Use actual extraction rationing and royalty calculation; financial default/expiry orchestration mirrors the shell and is tested.",
    "Recent output is mean realized state output before publication; freeze the baseline for the signed term.",
    "Strict recent=0 blocks issuance, not open-access mining. Startup floors reserve rights from nominal capacity.",
    "All royalties retain daily-capacity-value-per-turn timing. At full use 1% is 24% of hourly gross receipts, not a 1% sales royalty.",
    "A 2% nominal reference operating cost remains during idle turns; contribution margins, output and prices are sensitivity assumptions.",
    "Cash runway and signing fees normalize by nominal requested-quota gross value for identical initial wealth.",
    "Operating losses may take cash below zero; only royalty default, not general insolvency, is modeled.",
    "Forced-award defaults are separate from positive incremental NPV. Rational bidders may decline losing contracts.",
    "5% per game year discount; 24 post-term open-access turns; three unpaid obligations default and successful payment resets misses.",
    "Hypothetical fixed quotas reserve at most 75% of currently available capacity during supply shocks.",
  ],
  limitations: [
    "Not a seeded full-world campaign or production balance qualification.",
    "Produced output sells at the prescribed price; no inventory, failed sales or endogenous sell-through is simulated.",
    "Seeded capacity and era/resource price scales are checked; scenario prevalence, margins and utilization are not world-calibrated.",
    "No endogenous market price/demand clearing, tax, other businesses, borrowing, investment response, multiple tenders or strategic bidding.",
    "Anchor accounting with fixed FX. No currency volatility, financing rescue, uncertainty/insurance option value or strategic output suppression.",
    "Experimental recent quotas may imply physical shares below the current API minimum; mixed legacy contracts and renewals need a separate schema/rules design.",
    "Global scarcity relief, utilization ramping and mixed-resource corporate revenue are outside this isolated rationing experiment.",
    "Supply shutdown is an exogenous availability shock, not a deposit-depletion campaign.",
    "Uniform grid frequencies are stress coverage, not predicted adoption/default rates.",
  ],
  models: [...totals]
    .filter(([key]) => !key.includes("|") && !key.startsWith("common:"))
    .map(summarize),
  commonIssuable: [...totals].filter(([key]) => key.startsWith("common:")).map(summarize),
  byPath: [...totals].filter(([key]) => key.includes("|")).map(summarize),
  fixtures,
  examples,
  sensitivities,
};
writeFileSync(join(reportDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(
  JSON.stringify(
    {
      reportDir,
      arms,
      financialTurnSteps: turns,
      sensitivityArms: sensitivities.length,
      models: summary.models,
    },
    null,
    2
  ) + "\n"
);
