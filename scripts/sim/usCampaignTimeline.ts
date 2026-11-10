/** Bounded, deterministic campaign schedules over the frozen California prototype. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  allocatePrototypeBallots,
  PROTOTYPE_VERSION,
  type PrototypeSpot,
} from "../../src/lib/redistricting/rules/usGeographicPrototype";
import {
  runCampaignTimeline,
  type CampaignTimelineInput,
  type TimelineAction,
} from "../../src/lib/redistricting/rules/campaignTimelinePrototype";
import {
  STATE_PASSIVE_PS_PER_TURN,
  STATE_PS_CAP_DEFAULT,
  PRESSURE_DECAY_PER_TURN,
  PRESSURE_LADDER_INCREMENT,
  PRESSURE_LADDER_MAX_COST,
  PRESSURE_LADDER_MAX_VALUE,
} from "../../src/lib/politicalStrength/strengthConstants";
import { DEFAULT_DURATIONS } from "../../src/lib/constants/electionDurations";

function flag(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? "" : (process.argv[i + 1] ?? "");
}
const inputDir = flag("--inputs"),
  output = flag("--out");
if (!inputDir || !output)
  throw new Error(
    "Usage: tsx scripts/sim/usCampaignTimeline.ts --inputs <prior-snapshot-directory> --out <external-report.json>"
  );
const parentBytes = readFileSync(resolve(inputDir, "comparison.json"));
const parent = JSON.parse(parentBytes.toString()) as {
  manifest: { file: string; sha256: string }[];
  comparison: { weight: number; districts: { id: string; votes: number[] }[] }[];
};
const sourceBytes = readFileSync(resolve(inputDir, "ca-presidential-parts.csv"));
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
if (
  hash(sourceBytes) !== parent.manifest.find((r) => r.file === "ca-presidential-parts.csv")?.sha256
)
  throw new Error("Source snapshot differs from the parent report");
const reference: PrototypeSpot[] = [];
let district = "";
// The source's records are single-line; reject unexpected shape rather than
// accepting multiline or unbalanced quotes in this narrow input adapter.
for (const line of sourceBytes
  .toString()
  .split(/[\r\n]+/)
  .filter(Boolean)) {
  if ((line.match(/"/g)?.length ?? 0) % 2) throw new Error("Unexpected CSV quoting");
  const row = line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((s) => s.replace(/^"|"$/g, "").replaceAll('""', '"'));
  if (row.length !== 7) throw new Error("Unexpected source layout");
  if (/^\d+$/.test(row[0])) district = `CA-${row[0].padStart(2, "0")}`;
  if (!district || !row[1] || !/^[\d,]+$/.test(row[2])) continue;
  const left = Number(row[2].replaceAll(",", "")),
    right = Number(row[3].replaceAll(",", ""));
  const countyId = row[1].replace(/ \(pt\.\)$/, "");
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0)
    throw new Error("Invalid source count");
  if (left + right)
    reference.push({
      id: `${countyId}:${district}`,
      countyId,
      districtId: district,
      ballots: left + right,
      lean: (100 * right) / (left + right) - 50,
    });
}
const binding = {
  countryId: "US",
  electionType: "house",
  rulesVersion: PROTOTYPE_VERSION,
  planId: "US-CA-2026-timeline",
};
const scenarios = parent.comparison
  .filter((r) => r.weight === 0 || r.weight === 0.1)
  .map((arm) => {
    const ballotById = new Map<string, [number, number]>();
    for (const d of arm.districts) {
      const local = reference.filter((s) => s.districtId === d.id);
      const total = local.reduce((s, r) => s + r.ballots, 0);
      if (total !== d.votes[0] + d.votes[1]) throw new Error("Parent district totals differ");
      const projected = allocatePrototypeBallots({
        binding,
        dataPlanId: binding.planId,
        spots: local,
        parties: [
          { id: "D", votes: d.votes[0], position: -1 },
          { id: "R", votes: d.votes[1], position: 1 },
        ],
        strength: 1,
        adapter: "continuous",
      });
      projected.spots.forEach((s, i) =>
        ballotById.set(s.id, projected.ballots[i] as [number, number])
      );
    }
    if (ballotById.size !== reference.length) throw new Error("Incomplete parent geography");
    return {
      evidenceWeight: arm.weight,
      ballots: reference.map((s) => ballotById.get(s.id)!),
      districts: arm.districts,
    };
  });
if (scenarios.length !== 2) throw new Error("Missing baseline or 10% evidence arm");
const baselineDistricts = scenarios[0].districts;
const marginal = [...baselineDistricts].sort(
  (a, b) =>
    Math.abs(a.votes[0] - a.votes[1]) / (a.votes[0] + a.votes[1]) -
    Math.abs(b.votes[0] - b.votes[1]) / (b.votes[0] + b.votes[1])
)[0].id;
const countyVolumes = new Map<string, number>();
reference.forEach((s) =>
  countyVolumes.set(s.countyId, (countyVolumes.get(s.countyId) ?? 0) + s.ballots)
);
const largestCounty = [...countyVolumes].sort((a, b) => b[1] - a[1])[0][0];
const smallestSingleCounty = [...countyVolumes]
  .filter(
    ([countyId]) =>
      new Set(reference.filter((s) => s.countyId === countyId).map((s) => s.districtId)).size === 1
  )
  .sort((a, b) => a[1] - b[1])[0][0];
const targets = { district: { districtId: marginal }, county: { countyId: largestCounty } };
const decays = [
  ...[0, 0.05, 0.1, 0.2, 0.5].map((value) => ({ mode: "linear" as const, value })),
  ...[0.25, 0.5].map((value) => ({ mode: "fractional" as const, value })),
];
const scheduleNames = [
  "early-8",
  "spread-8",
  "late-8",
  "daily",
  "twice-daily",
  "three-daily",
  "build-refresh",
];
function schedule(
  name: string,
  horizon: number,
  actor: 0 | 1,
  target: TimelineAction["target"],
  attack = false
): TimelineAction[] {
  let turns: number[];
  if (name === "early-8") turns = Array(8).fill(0);
  else if (name === "late-8") turns = Array(8).fill(horizon - 1);
  else if (name === "spread-8")
    turns = Array.from({ length: 8 }, (_, i) => Math.floor((i * (horizon - 1)) / 7));
  else if (name === "twice-daily" || name === "three-daily")
    turns = Array.from({ length: horizon }, (_, turn) =>
      Array(name === "twice-daily" ? 2 : 3).fill(turn)
    ).flat();
  else if (name === "build-refresh")
    turns = Array.from({ length: horizon }, (_, i) => i).filter((t) => t < 10 || (t - 9) % 4 === 0);
  else turns = Array.from({ length: horizon }, (_, i) => i);
  return turns.map((turn, i) => ({
    id: `${actor}:${i.toString().padStart(3, "0")}`,
    turn,
    actor,
    kind: attack ? "attack" : "boost",
    target,
  }));
}
function profile(name: string, horizon: number) {
  return Array.from({ length: horizon }, (_, t) =>
    name === "early" ? horizon - t : name === "late" ? t + 1 : 1
  );
}
const baseParams = {
  spots: reference,
  psCap: STATE_PS_CAP_DEFAULT,
  baseCost: 2,
  pressureIncrement: PRESSURE_LADDER_INCREMENT,
  pressureDecay: PRESSURE_DECAY_PER_TURN,
  pressureCap: PRESSURE_LADDER_MAX_VALUE,
  maxUnitCost: PRESSURE_LADDER_MAX_COST,
  effectPoints: 0.4,
  effectCap: 3,
  countyFactor: 0.6,
  effectDecay: 0.1,
  decayMode: "linear" as const,
  pricing: "coverage" as const,
  actionsPerPartyPerTurn: 8,
  openingPs: [30, 30] as const,
  psIncome: [STATE_PASSIVE_PS_PER_TURN, STATE_PASSIVE_PS_PER_TURN] as const,
};
type Summary = Record<string, string | number | boolean | number[] | Record<string, number>>;
const results: Summary[] = [];
const traces: {
  label: string;
  input: CampaignTimelineInput;
  result: ReturnType<typeof runCampaignTimeline>;
}[] = [];
function experiment(
  label: string,
  arm: (typeof scenarios)[number],
  params: CampaignTimelineInput,
  dimensions: Record<string, string | number>
) {
  const result = runCampaignTimeline(params);
  const baselineByDistrict = new Map(arm.districts.map((d) => [d.id, d.votes]));
  const margin = (v: number[]) => (100 * (v[0] - v[1])) / (v[0] + v[1]);
  const district = result.districts.find((d) => d.id === marginal)!;
  const flips = result.districts.filter(
    (d) =>
      Math.sign(d.votes[0] - d.votes[1]) !==
      Math.sign(baselineByDistrict.get(d.id)![0] - baselineByDistrict.get(d.id)![1])
  ).length;
  results.push({
    label,
    evidenceWeight: arm.evidenceWeight,
    ...dimensions,
    baseCost: params.baseCost,
    decayMode: params.decayMode,
    decay: params.effectDecay,
    pricing: params.pricing,
    limit: params.actionsPerPartyPerTurn,
    horizon: params.turnoutWeights.length,
    openingPs: params.openingPs[0],
    income: params.psIncome[0],
    gainedVotes: result.gainedVotes,
    shareGainPoints: result.statewideShareGainPoints,
    psSpent: result.spent,
    psCredited: result.creditedPs,
    actionsPaid: result.paid,
    remainingPs: result.ps,
    gainedVotesPerPs: result.spent[0] ? result.gainedVotes / result.spent[0] : 0,
    districtMarginChange: margin(district.votes) - margin(baselineByDistrict.get(marginal)!),
    flips,
    conserved: result.conserved,
    rejections: result.rejected,
    maxEffect: Math.max(...result.history.map((h) => h.maxEffect)),
  });
  if (
    label === "selected" &&
    arm.evidenceWeight === 0 &&
    dimensions.turnout === "uniform" &&
    dimensions.opponent === "none"
  )
    traces.push({ label: JSON.stringify(dimensions), input: params, result });
}
const generalTurns = DEFAULT_DURATIONS.house.generalDurationHours;
for (const arm of scenarios)
  for (const baseCost of [1, 2, 3, 4])
    for (const decay of decays)
      for (const name of scheduleNames)
        for (const turnout of ["uniform", "early", "late"])
          for (const targetName of ["district", "county"] as const)
            for (const pricing of ["flat", "coverage"] as const)
              experiment(
                "grid",
                arm,
                {
                  ...baseParams,
                  ballots: arm.ballots,
                  baseCost,
                  effectDecay: decay.value,
                  decayMode: decay.mode,
                  pricing,
                  turnoutWeights: profile(turnout, generalTurns),
                  actions: schedule(name, generalTurns, 0, targets[targetName]),
                },
                { schedule: name, turnout, target: targetName, opponent: "none" }
              );
for (const arm of scenarios)
  for (const opening of [0, 10, 30])
    for (const income of [0, 5])
      for (const opponent of ["none", "daily", "attack"])
        for (const limit of [1, 3, 8])
          for (const horizon of [12, 24, 48])
            for (const targetName of ["district", "county"] as const) {
              const actions = schedule("daily", horizon, 0, targets[targetName]);
              if (opponent !== "none")
                actions.push(
                  ...schedule("daily", horizon, 1, targets[targetName], opponent === "attack")
                );
              experiment(
                "budget-opposition",
                arm,
                {
                  ...baseParams,
                  ballots: arm.ballots,
                  decayMode: "fractional",
                  effectDecay: 0.25,
                  openingPs: [opening, opening],
                  psIncome: [income, income],
                  actionsPerPartyPerTurn: limit,
                  turnoutWeights: profile("uniform", horizon),
                  actions,
                },
                { schedule: "daily", turnout: "uniform", target: targetName, opponent }
              );
            }
// Directly compare every schedule under the proposed limiter and both candidate decay rules.
for (const arm of scenarios)
  for (const targetName of ["district", "county"] as const)
    for (const name of scheduleNames)
      for (const mode of ["linear", "fractional"] as const)
        for (const limit of [1, 3, 8])
          experiment(
            "selected",
            arm,
            {
              ...baseParams,
              ballots: arm.ballots,
              decayMode: mode,
              effectDecay: mode === "linear" ? 0.1 : 0.25,
              actionsPerPartyPerTurn: limit,
              turnoutWeights: profile("uniform", generalTurns),
              actions: schedule(name, generalTurns, 0, targets[targetName]),
            },
            { schedule: name, turnout: "uniform", target: targetName, opponent: "none" }
          );
// Extra comparison: integer coverage units can make tiny county actions cost
// as much as the entire district, so test a fractional quote with a 0.5 PS floor.
for (const arm of scenarios)
  for (const countyId of [largestCounty, smallestSingleCounty])
    for (const pricing of ["flat", "coverage", "fractional-coverage"] as const)
      for (const name of ["daily", "twice-daily", "spread-8"])
        for (const opening of [0.5, 2, 30])
          for (const income of [0, 5])
            experiment(
              "county-price-granularity",
              arm,
              {
                ...baseParams,
                ballots: arm.ballots,
                pricing,
                decayMode: "fractional",
                effectDecay: 0.25,
                actionsPerPartyPerTurn: 3,
                openingPs: [opening, opening],
                psIncome: [income, income],
                turnoutWeights: profile("uniform", generalTurns),
                actions: schedule(name, generalTurns, 0, { countyId }),
              },
              { schedule: name, turnout: "uniform", target: countyId, opponent: "none" }
            );
for (const arm of scenarios)
  for (const rounding of ["per-batch", "carry"] as const)
    experiment(
      "small-county-rounding",
      arm,
      {
        ...baseParams,
        ballots: arm.ballots,
        pricing: "fractional-coverage",
        rounding,
        decayMode: "fractional",
        effectDecay: 0.25,
        actionsPerPartyPerTurn: 3,
        turnoutWeights: profile("uniform", generalTurns),
        actions: schedule("daily", generalTurns, 0, { countyId: smallestSingleCounty }),
      },
      {
        schedule: "daily",
        turnout: "uniform",
        target: smallestSingleCounty,
        opponent: "none",
        rounding,
      }
    );
const report = {
  experiment: "US local campaign timeline v1",
  parentReportSha256: hash(parentBytes),
  sourceSha256: hash(sourceBytes),
  sourceFiles: [
    "scripts/sim/usCampaignTimeline.ts",
    "src/lib/redistricting/rules/campaignTimelinePrototype.ts",
    "src/lib/redistricting/rules/usGeographicPrototype.ts",
    "src/lib/politicalStrength/strengthConstants.ts",
    "src/lib/constants/electionDurations.ts",
  ].map((file) => ({ file, sha256: hash(readFileSync(file)) })),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  assumptions: [
    "No database/live player measurements. Frozen California synthetic 50/50 district totals from the prior experiment.",
    "Conditional within-district distribution reuses presidential overlap proportions in both evidence arms; not an independent 2026 spot fit.",
    "Opening PS/income scenarios are synthetic, anchored to current code defaults; treasury generation, transfers, role efficiency and competing PS uses are excluded.",
    "Coverage price uses frozen turnout as a proxy. Production must use frozen resident coverage; no live population crosswalk is qualified.",
    "PS income then decay then receipt-ordered actions then ballots. No-op-at-cap actions are free rejections; partial-effect actions pay the full quoted price.",
    "Integer county coverage quotes use ceil(coverage/median district coverage * effect factor) units. Fractional quotes use max(0.25, coverage ratio * effect factor), rounded up to 0.5 PS. Pressure rises by one per paid click, preserving the existing state ladder.",
    "Fractional decay retains floating-point tails; fixed-point representation and pruning threshold still need qualification.",
    "Two-party fractional vote remainders carry per spot into later batches. Earlier ballots remain immutable; final residuals are retained for inspection, not used to rewrite the result. Multiparty constrained carry requires separate qualification.",
  ],
  anchors: {
    generalTurns,
    statePsCap: STATE_PS_CAP_DEFAULT,
    statePassivePs: STATE_PASSIVE_PS_PER_TURN,
    pressureDecay: PRESSURE_DECAY_PER_TURN,
  },
  targets: {
    marginal,
    largestCounty,
    smallestSingleCounty,
    countyDistricts: new Set(
      reference.filter((s) => s.countyId === largestCounty).map((s) => s.districtId)
    ).size,
  },
  caseCount: results.length,
  allConserved: results.every((r) => r.conserved),
  results,
  traces,
};
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output: resolve(output),
    cases: report.caseCount,
    allConserved: report.allConserved,
    targets: report.targets,
  })
);
