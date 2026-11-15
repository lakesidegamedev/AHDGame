/**
 * One-command reset rehearsal on a throwaway local database.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/rehearsal-x?directConnection=true \
 *   npx tsx scripts/world/rehearse-reset.ts --expect-db=rehearsal-x \
 *     --preset=2027-default [--no-starting-parties] [--turn] [--record=<path>]
 *
 * Runs the real reset, then asserts the result is complete and plausible.
 * Conformance only compares a world with its own seed, so the plausibility
 * rules in `resetRehearsal/rules.ts` carry the checks it cannot make.
 * Exit code 0 only when every check passes.
 */
import { writeFileSync } from "node:fs";
import type { Db } from "mongodb";
import { getValidatedEnv } from "@/lib/config/validatedEnv";
import { settingsFingerprint } from "@/lib/admin/resetRehearsal/gate";
import { presetDefaultsToFoundingPhase } from "@/lib/seeds/presetSelector";
import { supportsNoStartingParties } from "@/lib/admin/startingPartiesPresets";
import { assertResetDatabaseMatchesApplication } from "@/lib/admin/resetPreflight";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import {
  countriesByTier,
  isRegisteredTier,
  isShippingPreset,
  tierFor,
} from "@/lib/world/eraRoster";
import { REFERENCE_FIGURES } from "@/lib/admin/resetRehearsal/referenceFigures";
import { getRateDoc, rateFromDoc } from "@/lib/world/forex";
import { nppCorpSpawnPlan } from "@/lib/admin/seed/seedNppCorporations";
import {
  assertRehearsalTarget,
  checkTurnLog,
  runWorldChecks,
  type CheckResult,
  type RehearsalFailure,
  type RehearsalWorld,
} from "@/lib/admin/resetRehearsal/rules";
import { connectDb } from "../utils/db";
import { closeResetDb } from "./closeResetDb";
import { resolveResetTarget } from "./resetTarget";
import { currentHead, currentTreeHash } from "./rehearsalRecordFile";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);

function stepResult(name: string, failures: RehearsalFailure[]): CheckResult {
  return { name, passed: failures.length === 0, failures };
}

async function loadWorld(
  db: Db,
  preset: string,
  noStartingParties: boolean
): Promise<RehearsalWorld> {
  if (!isShippingPreset(preset)) throw new Error(`Unknown shipping preset: ${preset}`);
  const rosterCountries = (Object.keys(COUNTRY_CONFIGS) as CountryId[]).filter((id) =>
    isRegisteredTier(tierFor(preset, id))
  );
  const { getEnabledCountryIdsFromDb } = await import("@/lib/countryAccess");
  const enabled = new Set<string>(await getEnabledCountryIdsFromDb(db));
  const roster = new Set<string>(rosterCountries);
  const playerEnabledCountries = [...enabled].filter((id) => roster.has(id));
  const nppRunCountries = [
    ...countriesByTier(preset, "npp"),
    ...countriesByTier(preset, "econ"),
  ].filter((id) => roster.has(id));

  const rateDocs = await db
    .collection("exchangeRates")
    .find({}, { projection: { countryId: 1, rate: 1, baseRate: 1 } })
    .toArray();
  const rateMap = new Map(rateDocs.map((r) => [String(r.countryId), r]));
  const localPerUsd: Record<string, number> = {};
  for (const id of rosterCountries) {
    const doc = getRateDoc(rateMap as never, id);
    if (doc) localPerUsd[id] = rateFromDoc(doc);
  }

  const [budgets, banks, state, metrics, states, parties, seats, corps] = await Promise.all([
    db.collection("federalBudget").find({}).toArray(),
    db.collection("centralBanks").find({}).toArray(),
    db.collection("gameState").findOne({ _id: "current" as never }),
    db
      .collection("macroMetrics")
      .find(
        {},
        {
          projection: {
            countryId: 1,
            "economic.medianIncome.value": 1,
            "economic.gdpGrowth.value": 1,
          },
        }
      )
      .toArray(),
    db
      .collection("states")
      .find({}, { projection: { countryId: 1, population: 1 } })
      .toArray(),
    db
      .collection("politicalParties")
      .aggregate([{ $group: { _id: "$countryId", n: { $sum: 1 } } }])
      .toArray(),
    db
      .collection("seats")
      .aggregate([{ $group: { _id: "$countryId", n: { $sum: { $ifNull: ["$totalSeats", 1] } } } }])
      .toArray(),
    db
      .collection("corporations")
      .find(
        {},
        {
          projection: {
            ceoType: 1,
            countryId: 1,
            npcBankSeedKey: 1,
            liquidCapital: 1,
            totalShares: 1,
            "shareholders.shares": 1,
            publicFloat: 1,
          },
        }
      )
      .toArray(),
  ]);

  const popByState = new Map(states.map((s) => [String(s._id), s]));
  return {
    rosterCountries,
    playerEnabledCountries,
    nppRunCountries,
    noStartingParties,
    euroMembers: ((state?.euroAdoptedCountries as string[] | undefined) ?? []).slice(),
    budgets: budgets.map((b) => ({
      countryId: String(b.countryId),
      gdp: Number(b.gdp),
      inflationRate: b.economicFactors?.inflationRate,
      debtPrincipal: b.debt?.principal,
    })),
    centralBanks: banks.map((b) => ({
      id: String(b._id),
      countryId: String(b.countryId),
      primeRate: Number(b.primeRate),
    })),
    regions: metrics.map((m) => {
      const st = popByState.get(String(m._id));
      return {
        id: String(m._id),
        countryId: String(st?.countryId ?? m.countryId),
        population: Number(st?.population ?? 0),
        medianIncome: m.economic?.medianIncome?.value,
        gdpGrowth: m.economic?.gdpGrowth?.value,
      };
    }),
    partyCountByCountry: Object.fromEntries(parties.map((p) => [String(p._id), p.n as number])),
    spawnPlan: nppCorpSpawnPlan(preset, getStartingYearForPreset(preset)).map((p) => ({
      countryId: p.countryId,
      perSectorCount: p.perSectorCount,
    })),
    operatingIndustryCount: OPERATING_SECTOR_TYPES.length,
    corporations: corps.map((c) => ({
      id: String(c._id),
      ceoType: c.ceoType,
      countryId: c.countryId,
      isNpcBank: c.npcBankSeedKey !== undefined && c.npcBankSeedKey !== null,
      liquidCapital: c.liquidCapital,
      totalShares: c.totalShares,
      shareholderShares: Array.isArray(c.shareholders)
        ? c.shareholders.map((h: { shares?: number }) => Number(h.shares))
        : undefined,
      publicFloat: c.publicFloat,
    })),
    seatTotalByCountry: Object.fromEntries(seats.map((s) => [String(s._id), s.n as number])),
    localPerUsd,
    reference: REFERENCE_FIGURES[preset],
  };
}

async function main(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const preset = value("--preset");
  if (!preset) throw new Error("--preset=<preset> is required");
  const noStartingParties = flag("--no-starting-parties");
  if (noStartingParties && !supportsNoStartingParties(preset))
    throw new Error(`--no-starting-parties is not supported for --preset=${preset}`);

  const env = getValidatedEnv();
  const databaseName = resolveResetTarget(env, args);
  assertRehearsalTarget(env.MONGODB_URI, databaseName);
  assertResetDatabaseMatchesApplication(env, databaseName, "checked target");
  process.env.MONGODB_DB = databaseName;

  const db = await connectDb(databaseName, env.MONGODB_URI);
  assertResetDatabaseMatchesApplication(env, db.databaseName, "connected database");
  console.log(`Rehearsing ${preset} on ${db.databaseName}`);

  const { resetAndBootstrapGameWorld } = await import("@/lib/admin/resetAndBootstrapGameWorld");
  let resetFailures: RehearsalFailure[] = [];
  try {
    const result = await resetAndBootstrapGameWorld({
      db,
      mode: "historical",
      preset,
      startingParties: noStartingParties ? "none" : undefined,
      resetReference: true,
      deleteProfiles: false,
      adminUsername: "REHEARSAL",
      log: () => {},
    });
    if (result.status !== "succeeded") {
      const contained = result.logs.find((l) => l.includes("step(s) contained")) ?? "";
      resetFailures.push({
        check: "reset",
        scope: "reset",
        message: `reset finished ${result.status.toUpperCase()}${contained ? `: ${contained.replace(/^.*contained: /, "")}` : ""}`,
      });
    }
    for (const c of result.readiness.criticalChecks)
      resetFailures.push({
        check: "reset",
        scope: c.scope,
        message: `critical ${c.metric}: expected ${c.expected}, actual ${c.actual}`,
      });
    for (const v of result.readiness.residueViolations)
      resetFailures.push({ check: "reset", scope: "residue", message: v });
    if (result.readiness.error)
      resetFailures.push({ check: "reset", scope: "readiness", message: result.readiness.error });
  } catch (error) {
    resetFailures = [
      {
        check: "reset",
        scope: "reset",
        message: `reset threw: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  results.push(stepResult("reset", resetFailures));
  if (resetFailures.some((f) => f.message.startsWith("reset threw"))) return results;

  const diag = await db
    .collection("seedDiagnostics")
    .find({}, { projection: { summary: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .next();
  const critical = diag?.summary?.critical;
  results.push(
    stepResult(
      "conformance",
      !diag
        ? [
            {
              check: "conformance",
              scope: "seedDiagnostics",
              message: "no diagnostic report found",
            },
          ]
        : critical > 0
          ? [
              {
                check: "conformance",
                scope: "seedDiagnostics",
                message: `${critical} critical check(s)`,
              },
            ]
          : []
    )
  );

  results.push(...runWorldChecks(await loadWorld(db, preset, noStartingParties)));

  if (flag("--turn")) {
    results.push(stepResult("turn", await runOneTurn(db)));
  }
  return results;
}

async function runOneTurn(db: Db): Promise<RehearsalFailure[]> {
  try {
    // The cron-drift guard would pause an idle fresh world on its first turn.
    await db
      .collection("gameConfig")
      .updateOne({ _id: "default" as never }, { $set: { simSandbox: true } }, { upsert: true });
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { isProcessing: false } });
    const { processTurn } = await import("@/lib/turnSystem");
    await processTurn();
    const { drainDeferredTurnWork } = await import("@/lib/turn/deferredTurnWork");
    await drainDeferredTurnWork();
    const log = await db
      .collection("turnLogs")
      .find({})
      .sort({ turn: -1, _id: -1 })
      .limit(1)
      .next();
    return checkTurnLog(
      log && {
        success: log.success,
        failedPhases: log.failedPhases,
        abortedPhases: log.abortedPhases,
      }
    );
  } catch (error) {
    return [
      {
        check: "turn",
        scope: "processTurn",
        message: `turn threw: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
}

function foundingPhaseFor(): boolean {
  const preset = value("--preset") ?? "";
  return presetDefaultsToFoundingPhase(preset, flag("--no-starting-parties") ? "none" : "default");
}

function recordFingerprint(): string {
  return settingsFingerprint({
    preset: value("--preset") ?? "",
    mode: "historical",
    startingParties: flag("--no-starting-parties") ? "none" : "default",
    foundingPhase: foundingPhaseFor(),
  });
}

main()
  .catch((error): CheckResult[] => [
    stepResult("setup", [
      {
        check: "setup",
        scope: "setup",
        message: error instanceof Error ? error.message : String(error),
      },
    ]),
  ])
  .then(async (results) => {
    const passed = results.every((r) => r.passed);
    console.log("\nCheck results");
    for (const r of results) {
      console.log(
        `${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.passed ? "" : ` (${r.failures.length})`}`
      );
      for (const f of r.failures) console.log(`      ${f.scope}: ${f.message}`);
    }
    console.log(`\n${passed ? "REHEARSAL PASSED" : "REHEARSAL FAILED"}`);
    writeFileSync(
      value("--record") ?? "rehearsal-record.json",
      JSON.stringify(
        {
          head: currentHead(),
          treeHash: currentTreeHash(),
          preset: value("--preset") ?? null,
          mode: "historical",
          startingParties: flag("--no-starting-parties") ? "none" : "default",
          foundingPhase: foundingPhaseFor(),
          settingsFingerprint: recordFingerprint(),
          flags: args.filter(
            (a) => a.startsWith("--") && !a.startsWith("--expect-db") && !a.startsWith("--record")
          ),
          timestamp: new Date().toISOString(),
          passed,
          checks: results,
        },
        null,
        2
      )
    );
    await closeResetDb().catch(() => {});
    process.exit(passed ? 0 : 1);
  });
