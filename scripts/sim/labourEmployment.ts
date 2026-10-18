/**
 * Reproducible regional unemployment projections using the production rules.
 * --live only reads regional aggregates and law/funding inputs. Reports and
 * snapshots must be written outside the checkout; no production writes occur.
 *
 * npx tsx scripts/sim/labourEmployment.ts --live --env <root/.env.local> --out <external-dir>
 * npx tsx scripts/sim/labourEmployment.ts --snapshot <snapshot.json> --out <external-dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, isAbsolute, join } from "node:path";
import { config } from "dotenv";
import { MongoClient, BSON } from "mongodb";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  advanceEmployment,
  initializeEmployment,
  type EmploymentState,
} from "../../src/lib/labour/rules/employment";
import {
  resolveEmploymentPolicy,
  type EmploymentLaw,
} from "../../src/lib/labour/rules/employmentPolicy";
import { loadEmploymentLawBook } from "../../src/lib/labour/employmentPolicies";
import { advanceOutputTrend } from "../../src/lib/metricEngine/outputTrend";
import { unemploymentNode } from "../../src/lib/metricEngine/registry/economic";
import { evalNode } from "../../src/lib/metricEngine/coexistence";
import { NATIONAL_SCOPE_IDS } from "../../src/lib/constants/nationalScope";
import { TURNS_PER_YEAR } from "../../src/lib/constants/turnTime";
import type { MacroMetricsDoc } from "../../src/lib/db/types/macroMetrics";
import type { State } from "../../src/lib/db/types/state";
import type { GameState } from "../../src/lib/db/types/gameState";

interface Region {
  id: string;
  country: string;
  laborForce: number;
  demand?: number;
  unemployment: number;
  matchingFriction?: number;
  skill?: number;
  medianIncome?: number;
  participation: number;
  outputGap: number;
  growth: number;
  headlineGrowth?: number;
  trend: number;
  laws: EmploymentLaw[];
}
interface Snapshot {
  turn: number;
  regions: Region[];
  policyReadProfile?: {
    roundTrips: number;
    documents: number;
    bytes: number;
    byCollection: Record<string, { roundTrips: number; documents: number; bytes: number }>;
  };
}

function argument(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

async function collectSnapshot(): Promise<Snapshot> {
  config({ path: argument("--env") ?? ".env.local", quiet: true });
  const uri = process.env.MONGODB_URI_LIVE;
  if (!uri) throw new Error("MONGODB_URI_LIVE is missing");
  const client = new MongoClient(uri, {
    monitorCommands: true,
    directConnection: true,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 120_000,
  });
  let profilingPolicies = false;
  const requests = new Map<number, string>();
  const profile = {
    roundTrips: 0,
    documents: 0,
    bytes: 0,
    byCollection: {} as Record<string, { roundTrips: number; documents: number; bytes: number }>,
  };
  client.on("commandStarted", (event) => {
    if (!profilingPolicies || (event.commandName !== "find" && event.commandName !== "getMore"))
      return;
    const collection = String(event.command.find ?? event.command.collection);
    requests.set(event.requestId, collection);
    profile.roundTrips++;
    const row = (profile.byCollection[collection] ??= { roundTrips: 0, documents: 0, bytes: 0 });
    row.roundTrips++;
  });
  client.on("commandSucceeded", (event) => {
    const collection = requests.get(event.requestId);
    if (!collection) return;
    requests.delete(event.requestId);
    const rows = event.reply.cursor?.firstBatch ?? event.reply.cursor?.nextBatch ?? [];
    const bytes = rows.reduce(
      (sum: number, row: Record<string, unknown>) => sum + BSON.calculateObjectSize(row),
      0
    );
    profile.documents += rows.length;
    profile.bytes += bytes;
    profile.byCollection[collection].documents += rows.length;
    profile.byCollection[collection].bytes += bytes;
  });
  try {
    await client.connect();
    const db = client.db("a-house-divided");
    const state = await db.collection<GameState>("gameState").findOne(
      { _id: "current" },
      {
        projection: {
          currentTurn: 1,
          isProcessing: 1,
          currentYear: 1,
          startingYear: 1,
          departmentFinanceEnabled: 1,
          regionalLegislationFinanceEnabled: 1,
        },
      }
    );
    if (!state || state.isProcessing) throw new Error("Capture requires a completed, idle turn");
    const [states, macro, boards] = await Promise.all([
      db
        .collection<State>("states")
        .find({})
        .project<State>({ _id: 1, countryId: 1, population: 1, outputGap: 1, outputTrendGrowth: 1 })
        .toArray(),
      db
        .collection<MacroMetricsDoc>("macroMetrics")
        .find({})
        .project<MacroMetricsDoc>({ _id: 1, countryId: 1, economic: 1 })
        .toArray(),
      db
        .collection<{ _id: string; values: Record<string, number> }>("politicalMetrics")
        .find({})
        .project({ _id: 1, values: 1 })
        .toArray(),
    ]);
    const regions = states.filter((s) => !NATIONAL_SCOPE_IDS.has(s._id));
    profilingPolicies = true;
    const laws = await loadEmploymentLawBook(db, state.currentTurn, regions, {
      national: state.departmentFinanceEnabled === true,
      regional: state.regionalLegislationFinanceEnabled === true,
      year: state.currentYear,
      baselineYear: state.startingYear,
    });
    profilingPolicies = false;
    const after = await db
      .collection<GameState>("gameState")
      .findOne({ _id: "current" }, { projection: { currentTurn: 1, isProcessing: 1 } });
    if (after?.currentTurn !== state.currentTurn || after?.isProcessing)
      throw new Error("Turn changed during capture; retry");
    const macroById = new Map(macro.map((m) => [m._id, m]));
    const boardById = new Map(boards.map((b) => [b._id, b]));
    return {
      turn: state.currentTurn,
      policyReadProfile: profile,
      regions: regions.flatMap((s) => {
        const e = macroById.get(s._id)?.economic;
        const laborForce = e?.laborForce?.value;
        if (!e || !laborForce || laborForce <= 0) return [];
        const extra = e as typeof e & { labourDemandTurn?: number };
        return [
          {
            id: s._id,
            country: s.countryId,
            laborForce,
            demand:
              extra.labourDemandTurn === state.currentTurn ? e.labourDemand?.value : undefined,
            unemployment: e.unemploymentRate?.value ?? 4.5,
            matchingFriction: e.matchingFriction?.value,
            skill: boardById.get(s._id)?.values?.["education.adultSkills"],
            medianIncome: e.medianIncome?.value,
            participation: e.laborParticipation?.value ?? 62,
            outputGap: typeof s.outputTrendGrowth === "number" ? (s.outputGap ?? 0) : 0,
            growth: e.sectorGrowth?.value ?? e.gdpGrowth?.value ?? 0,
            headlineGrowth: e.gdpGrowth?.value,
            trend: s.outputTrendGrowth ?? e.trendGrowth?.value ?? 0,
            laws: laws.get(s._id) ?? [],
          },
        ];
      }),
    };
  } finally {
    await client.close();
  }
}

const scenarios = [
  "legacy",
  "current_laws",
  "net_hiring_1pct_labor_force",
  "fully_delivered_existing_programs",
  "recession_then_recovery",
  "corporate_ownership_transfer",
] as const;

export function projectUnemployment(snapshot: Snapshot, horizon = 240) {
  const points = [0, 12, 24, 48, 96, 144, 240].filter((x) => x <= horizon);
  const output: Record<string, Record<string, Record<number, number>>> = {};
  const endRegions: Record<string, Record<string, number>> = {};
  for (const scenario of scenarios) {
    const countryPoints = new Map<string, Map<number, { weighted: number; laborForce: number }>>();
    endRegions[scenario] = {};
    for (const region of snapshot.regions) {
      let employment: EmploymentState | undefined = initializeEmployment(
        region.laborForce,
        region.unemployment,
        region.demand,
        snapshot.turn
      );
      let unemployment = region.unemployment;
      let trend = { gap: region.outputGap, trendGrowth: region.trend };
      for (let offset = 0; offset <= horizon; offset++) {
        const turn = snapshot.turn + offset;
        const laws =
          scenario === "fully_delivered_existing_programs"
            ? region.laws.map((l) => ({ ...l, strength: 1, delivery: 1 }))
            : region.laws;
        const policy = resolveEmploymentPolicy(laws, turn, TURNS_PER_YEAR);
        const supply =
          region.laborForce * (1 + policy.participationBonus / Math.max(1, region.participation));
        if (offset > 0) {
          if (scenario === "legacy") {
            unemployment = evalNode(
              unemploymentNode,
              {
                current: {
                  "economic.gdpGrowth": region.headlineGrowth ?? region.growth,
                  "economic.trendGrowth": trend.trendGrowth,
                  ...(region.demand !== undefined
                    ? { "economic.labourTightness": region.demand / region.laborForce }
                    : {}),
                },
                prev: {},
                prevSimBaseline: { "economic.unemploymentRate": unemployment },
                providers: {},
                spending: {},
                policyValue: unemployment,
              },
              region.id
            ).value;
          } else {
            const demand =
              scenario === "net_hiring_1pct_labor_force" && region.demand !== undefined
                ? region.demand + Math.min(1, offset / 48) * region.laborForce * 0.01
                : region.demand;
            const gap =
              scenario === "recession_then_recovery"
                ? offset <= 24
                  ? -5
                  : -5 * Math.pow(0.5, (offset - 24) / 12)
                : trend.gap;
            const result = advanceEmployment({
              turn,
              turnsPerYear: TURNS_PER_YEAR,
              laborForce: supply,
              initialLaborForce: region.laborForce,
              unemployment,
              corporateDemand: demand,
              matchingFriction: region.matchingFriction,
              workforceSkill: region.skill,
              outputGap: gap,
              medianIncome: region.medianIncome,
              policy,
              previous: employment,
            });
            unemployment = result.unemployment;
            employment = result.state;
          }
          trend = advanceOutputTrend(trend, region.growth, TURNS_PER_YEAR);
        }
        if (points.includes(offset)) {
          const times = countryPoints.get(region.country) ?? new Map();
          const total = times.get(offset) ?? { weighted: 0, laborForce: 0 };
          const weight = offset === 0 || scenario === "legacy" ? region.laborForce : supply;
          total.weighted += unemployment * weight;
          total.laborForce += weight;
          times.set(offset, total);
          countryPoints.set(region.country, times);
        }
        if (offset === horizon) endRegions[scenario][region.id] = unemployment;
      }
    }
    output[scenario] = Object.fromEntries(
      [...countryPoints].map(([country, times]) => [
        country,
        Object.fromEntries(
          [...times].map(([turn, total]) => [
            turn,
            Number((total.weighted / total.laborForce).toFixed(3)),
          ])
        ),
      ])
    );
  }
  return { horizon, points, countries: output, endRegions };
}

async function main() {
  const dirArg = argument("--out");
  if (!dirArg) throw new Error("--out must name an external report directory");
  const dir = resolve(dirArg);
  const within = relative(process.cwd(), dir);
  if (!within.startsWith("..") && !isAbsolute(within))
    throw new Error("Reports must stay outside the source checkout");
  const snapshot = argument("--snapshot")
    ? (JSON.parse(readFileSync(argument("--snapshot")!, "utf8")) as Snapshot)
    : process.argv.includes("--live")
      ? await collectSnapshot()
      : undefined;
  if (!snapshot) throw new Error("Supply --snapshot or --live");
  const projection = projectUnemployment(snapshot);
  const sourceFiles = [
    "src/lib/labour/rules/employment.ts",
    "src/lib/labour/rules/employmentPolicy.ts",
    "src/lib/labour/employmentPolicies.ts",
    "src/lib/metricEngine/phase.ts",
    "scripts/sim/labourEmployment.ts",
  ];
  const evidence = {
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceHashes: Object.fromEntries(
      sourceFiles.map((file) => [
        file,
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ])
    ),
    inputHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    simulationType: "conditional regional rules projection",
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "regional-inputs.json"), JSON.stringify(snapshot, null, 2));
  writeFileSync(join(dir, "projection.json"), JSON.stringify({ evidence, ...projection }, null, 2));
  const lines = [
    "# Regional employment projection",
    "",
    `Source: completed turn ${snapshot.turn}; ${snapshot.regions.length} regions.`,
    "",
    "These are conditional rules projections, not a complete future world simulation. Corporate demand, skills, matching friction and delivery factors stay fixed except for the declared scenario. Existing enactment ramps continue. Output growth is held constant and the production trend advances. All countries use the same employment rules. Population, prices, profits, migration and future political choices are not forecast.",
    "",
    "| Country | Scenario | Now | +24 turns | +48 | +96 | +144 | +240 |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const country of ["US", "UK", "JP"])
    for (const scenario of scenarios) {
      const values = projection.countries[scenario][country];
      if (values)
        lines.push(
          `| ${country} | ${scenario} | ${[0, 24, 48, 96, 144, 240].map((p) => `${values[p]}%`).join(" | ")} |`
        );
    }
  lines.push(
    "",
    "The expansion scenario adds desired net jobs equal to 1% of each region's initial labor force over 48 turns. Fully delivered programs are a hypothetical policy/funding sensitivity, not a claim about current funding. Recession holds a -5% output gap for 24 turns then recovers with a 12-turn half-life. The legacy comparison reproduces the old unemployment path without prospective wage/automation shocks."
  );
  writeFileSync(join(dir, "projection.md"), lines.join("\n"));
  console.log(
    JSON.stringify(
      {
        sourceTurn: snapshot.turn,
        regions: snapshot.regions.length,
        countries: Object.fromEntries(
          scenarios.map((s) => [
            s,
            Object.fromEntries(["US", "UK", "JP"].map((c) => [c, projection.countries[s][c]])),
          ])
        ),
      },
      null,
      2
    )
  );
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/labourEmployment.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.name : "Projection failed");
    process.exitCode = 1;
  });
}
