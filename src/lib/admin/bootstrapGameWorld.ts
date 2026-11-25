import { seedAllCountryData } from "@/lib/admin/seedCountryData";
export { seedAllCountryData } from "@/lib/admin/seedCountryData";
import { reanchorBackgroundRegionalMacro2027 } from "./seed/reanchorBackgroundRegionalMacro2027";
import {
  clearStartingPolitics,
  loadStartingPartiesMode,
  type StartingPartiesMode,
} from "./startingParties";
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import type { Db } from "mongodb";
import type { ResetRunRecord } from "@/lib/admin/resetRunRecord";

import { reconcileCommandEconomySoes } from "@/lib/admin/seed/reconcileCommandEconomySoes";

import { initializeGameState, ensurePerpetualElections, ensureUKElections } from "@/lib/turnSystem";
import {
  ensureCAElections,
  ensureCAProvincialElections,
  ensureCAPremierElections,
} from "@/lib/countries/ca/elections/perpetual";
import { generateStockExchangeSnapshots } from "@/lib/turn/stockExchangeSnapshot";
import {
  ensureUKRegionalCouncilElections,
  ensureJPElections,
  ensureJPCouncillorElections,
  ensureDEElections,
  ensureBRElections,
  ensureBRGovernorElections,
  ensureNGElections,
  ensureIEElections,
  ensureIEUachtaranElections,
  ensureIELocalCouncilElections,
  ensureIECathaoirleachElections,
  ensureCNElections,
  ensureCNPeoplesCongressElections,
  ensureCNGovernorElections,
  ensureRUSupremeSovietElections,
  ensureRUNationalitiesElections,
  ensureRURepublicSovietElections,
  ensureRUGovernorElections,
  ensureDDVolkskammerElections,
  ensureDDGovernorElections,
  ensureFRElections,
  ensureFRSenateElections,
  ensureITElections,
  ensureITSenateElections,
  ensureESElections,
  ensureESSenateElections,
  ensureSEElections,
  ensureTRElections,
  ensureTRSenateElections,
  DEFAULT_DURATIONS,
  withElectionGameStateSnapshot,
} from "@/lib/elections/scheduling";
import { getJpSangiinClassSeats } from "@/lib/constants/states";
import { MS_PER_TURN, getStartingYearForPreset } from "@/lib/constants/turnTime";
import { getCycleAnchors } from "@/lib/elections/cycleAnchorContext";
import { electionToLarpYear } from "@/lib/utils/formatters";
import { getSeatIdFromElection } from "@/lib/seats/seatId";
import type { Election } from "@/lib/db/types";
import { seedColdWarFoundations } from "@/lib/admin/seed/seedColdWarFoundations";
import { seedHistoricalOfficials, seedFromSeats } from "@/lib/npp/seedHistorical";
import { getPresetSeats } from "@/lib/constants/historicalSeats";
import { initializeOfficials } from "@/lib/admin/bootstrap/initializeOfficials";
import { shouldSeedHistoricalOfficials } from "@/lib/admin/seed/historicalSeedGate";
import {
  seedStatePolicies,
  seedBudgets,
  seedUkBudgets,
  seedSeats,
  seedPartyBudgets,
  seedUnions,
  seedSovereignBondInstruments,
  seedScotus,
  seedIndexes,
  seedCountyMapData,
  seedJpBudgets,
  seedDeBudgets,
  seedBRGovernmentFormation,
  seedBrBudgets,
  seedRUGovernmentFormation,
  seedCnBudgets,
  seedRuBudgets,
  seedFrBudgets,
  seedItBudgets,
  seedEsBudgets,
  seedSeBudgets,
  seedTrBudgets,
  seedGrBudgets,
  seedAtBudgets,
  seedFiBudgets,
  seedDdBudgets,
  seedCNWiki,
  seedNGWiki,
  seedIeBudgets,
  seedNGGovernors,
  seedNgBudgets,
  seedForex,
  seedCommodityPrices,
  seedRegistrationLanes,
} from "@/lib/admin/seed";
import { runMigrations } from "@/lib/migrations/runner";
import { MIGRATIONS } from "@/lib/migrations/registry";
import { saveFiscalYearSnapshot } from "@/lib/budget/fiscalYear";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { reconcileSignedTariffBills } from "@/lib/tariffs/reconcileTariffs";
import { seedOfficeStates } from "@/lib/governorOffice/seedOfficeStates";
import { seedEasternBlocBudget } from "@/lib/admin/seed/seedEasternBloc";

import { seedCountryGameStates } from "@/lib/admin/seed/seedCountryGameStates";
import { seedMacroCountries } from "@/lib/world/macro";

// Union republics promoted to their own playable countries: they share the
// satellites' one-party seeding shape even though their constitutional status
// inside the USSR differed.

import { isEasternBlocEra } from "@/lib/seeds/presetSelector";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Document } from "mongodb";
import { statesCollection } from "@/lib/db/repositories/states";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { seatsCollection } from "@/lib/db/repositories/seats";
import { partyBudgetCollection } from "@/lib/db/repositories/partyBudget";
import { federationSettlementApplicationsCollection } from "@/lib/db/repositories/federationSettlementApplications";
import { worldEntityStatesCollection } from "@/lib/db/repositories/worldEntityStates";

async function seedInitialBudgetSnapshots(db: Db, log: (msg: string) => void): Promise<void> {
  const budgets = await federalBudgetCollection(db).find({}).toArray();
  // The budget docs are already in hand and the turn is one shared singleton,
  // so both are handed down rather than re-read once per country.
  const gameState = await gameStateCollection<Document>(db).findOne(
    { _id: "current" } as Record<string, unknown>,
    { projection: { currentTurn: 1 } }
  );
  const currentTurn = (gameState as { currentTurn?: number } | null)?.currentTurn ?? 0;
  for (const budget of budgets) {
    const countryId = budget.countryId ?? COUNTRY_CONFIGS.US.id;
    const budgetDocId = String(budget._id);
    const fiscalYear = budget.fiscalYear ?? 2020;
    await saveFiscalYearSnapshot(db, countryId, budgetDocId, fiscalYear, { budget, currentTurn });
  }
  log(`Captured ${budgets.length} initial FY budget snapshot(s)`);
}

export type BootstrapMode = "historical" | "vacant";

export interface BootstrapOptions {
  /** 1991 only: leave political offices vacant for player-created parties. */
  startingParties?: StartingPartiesMode;
  db: Db;
  /**
   * The reset run's failure record. When present, the RECOVERABLE blocks below
   * are contained: a throw is recorded and the run continues, degrading its
   * outcome to `partial` rather than discarding a build that otherwise worked.
   *
   * Absent for direct callers (`scripts/bootstrap-full.ts`, tests), which keep
   * today's abort-on-anything behaviour.
   */
  run?: ResetRunRecord;
  mode?: BootstrapMode;
  preset?: string;
  skipRegionalCouncil?: boolean;
  resetReference?: boolean;
  /** If true, only run seeders — skip election spawning, official seeding, and game state init */
  seedOnly?: boolean;
  /**
   * Pre-iteration founding phase: seed officials in "priors" mode (chambers
   * vacant) and SKIP the JP Sangiin inline bootstrap so the founding-aware
   * ensure* battery seats both Sangiin classes together (cycle 0) instead.
   */
  preIteration?: boolean;
  log?: (msg: string) => void;
}

export async function bootstrapGameWorld(options: BootstrapOptions) {
  let mode = options.mode ?? "historical";
  const preset = options.preset ?? DEFAULT_SEED_PRESET;
  const skipRegionalCouncil = options.skipRegionalCouncil ?? false;
  const resetReference = options.resetReference ?? false;
  const seedOnly = options.seedOnly ?? false;
  const startingParties = await loadStartingPartiesMode(
    options.db,
    preset,
    options.startingParties
  );
  const noStartingParties = startingParties === "none";
  const globallyVacant = preset === "2019-no-parties";
  if (noStartingParties && !globallyVacant) mode = "historical";
  const preIteration = options.preIteration ?? false;
  const log = options.log ?? (() => {});
  const { db } = options;

  // Contain a RECOVERABLE block. Without a run record this is a bare call, so
  // direct callers are unaffected.
  //
  // ⚠️ Structural work is deliberately NOT routed through this — `runSeed`'s
  // core (seedAllCountryData), `initializeGameState`, the clock stamp and the
  // commandEconomy gate write must still abort, because a world missing them is
  // not a world and everything after would seed on top of the damage.
  const guarded = <T>(name: string, fn: () => Promise<T>): Promise<T | null> =>
    options.run ? options.run.step("build", name, fn) : fn().then((v) => v as T | null);
  log(seedOnly ? "Re-seeding reference data" : `Bootstrapping clean world (${mode})`);

  // "Is this world empty?" MUST be measured before any seeder in this run
  // writes. Several country seeders below (notably `seedNGGovernors`) always
  // insert officials + NPPs, so a count taken later reports a non-empty world
  // on a genuinely fresh bootstrap — which is exactly how the authored
  // historical rosters (US 83rd Congress under 1953-default, every other
  // preset's chambers) stopped being seeded. See historicalSeedGate.ts.
  const [preExistingOfficialsCount, preExistingNppsCount] = await Promise.all([
    electedOfficialsCollection<Document>(db).countDocuments(),
    nppsCollection<Document>(db).countDocuments({ retiredAt: null }),
  ]);

  await seedAllCountryData(db, resetReference, log, preset, options.run);

  // All state/cohort population seeds are complete. A reference-only refresh
  // preserves live county stocks; new worlds and explicit reference resets rebuild them.
  const { seedCountyPopulations } = await import("@/lib/counties/seed");
  await seedCountyPopulations(db, { replace: !seedOnly || resetReference, preset });

  // Command Economy v2 gates RU/CN's multi-SOE seed (seedRuBudgets/seedCnBudgets,
  // below) behind `gameConfig.commandEconomyEnabled`. Tie it to era on every
  // bootstrap — see resetGameWorld.ts for the matching in-world-reset path and
  // the full rationale, including why this MUST follow seedAllCountryData rather
  // than precede it (`runSeed` re-seeds gameConfig from a static object that
  // hardcodes the flag to true, so an earlier write is silently overwritten).
  // It still lands before the budget seeders below, which are what read it.
  const commandEconomyEnabled = isEasternBlocEra(preset);
  await gameConfigCollection(db).updateOne(
    { _id: "default" },
    {
      $set: {
        commandEconomyEnabled,
        commandEconomyEnabledBy: "system:bootstrap",
        commandEconomyEnabledAt: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  await seedStatePolicies(db, resetReference, log, preset);
  await guarded("seedBudgets", () => seedBudgets(db, resetReference, log, preset));
  await seedUkBudgets(db, resetReference, log, preset);
  await seedJpBudgets(db, resetReference, log, preset);
  await seedDeBudgets(db, resetReference, log, preset);
  await seedBrBudgets(db, resetReference, log, preset);
  await seedCnBudgets(db, resetReference, log, preset);
  // The legacy RU seeder constructs Soviet SOEs. The 2019 democratic fiscal
  // pack below owns the modern RU budget and sovereign issuer instead.
  if (preset !== "2019-default") await seedRuBudgets(db, resetReference, log, preset);
  await seedFrBudgets(db, resetReference, log, preset);
  await seedItBudgets(db, resetReference, log, preset);
  await seedEsBudgets(db, resetReference, log, preset);
  await seedSeBudgets(db, resetReference, log, preset);
  await seedTrBudgets(db, resetReference, log, preset);
  await seedGrBudgets(db, resetReference, log, preset);
  await seedAtBudgets(db, resetReference, log, preset);
  await seedFiBudgets(db, resetReference, log, preset);
  await seedDdBudgets(db, resetReference, log, preset);
  const { seedCaBudgets } = await import("./seed/seedCaBudgets");
  await seedCaBudgets(db, resetReference, log, preset);

  // Warsaw-Pact BUDGETS. Countries are seeded in `seedAllCountryData`; only
  // budgets live here because budgets are region-CONSUMING and must follow the
  // reconcile barrier that closes that function. Ukraine, Byelorussia and the
  // Baltics are full countries with their own `states` rows, so they need the
  // same federalBudget + enactedLaws treatment as the satellites.
  if (isEasternBlocEra(preset)) {
    for (const cid of ["HU", "PL", "RO", "YU", "BG", "CS", "UKR", "BLR", "BAL"] as const) {
      await guarded(`seedEasternBlocBudget:${cid}`, () =>
        seedEasternBlocBudget(db, resetReference, log, preset, cid)
      );
    }
  }

  const { seedSuccessorBudgets1991 } = await import("./seed/seedSuccessorBudgets1991");
  await guarded("seedSuccessorBudgets1991", () =>
    seedSuccessorBudgets1991(db, resetReference, preset, log)
  );
  const { seedModernBudgets2019 } = await import("./seed/seedModernBudgets2019");
  await guarded("seedModernBudgets2019", () =>
    seedModernBudgets2019(db, resetReference, preset, log)
  );
  const { seedModernTransitionBudgets2027 } =
    await import("./seed/seedModernTransitionBudgets2027");
  await guarded("seedModernTransitionBudgets2027", () =>
    seedModernTransitionBudgets2027(db, resetReference, preset, log)
  );

  // Every command-economy seeder above reads `commandEconomyEnabled` itself and
  // falls back to the legacy single-corp shape via a silent `return` or an empty
  // filter. Read back what they actually produced. A command country that came
  // up with no enterprises or no producing sectors is an unplayable economy, and
  // it must stop the bootstrap here rather than ship and be found by players 73
  // turns later. See verifyCommandEconomySeed for the incident this encodes.
  {
    const { verifyCommandEconomySeed } = await import("@/lib/admin/seed/verifyCommandEconomySeed");
    const report = await verifyCommandEconomySeed(db, preset);
    for (const issue of report.issues) log(`[command-economy] ${issue}`);
    if (report.fatal.length > 0) {
      throw new Error(
        `Command-economy seed failed for ${report.fatal.join(", ")}: ${report.issues.join(" | ")}`
      );
    }
    if (report.checked && report.issues.length === 0) {
      log(`[command-economy] ${report.countries.length} command country(s) verified`);
    }
  }

  // Political-legislation baseline: the enacted law book for the world's year
  // plus one budget sync. Runs after states AND budgets exist (it prices
  // baseline laws on the regional-rollup fiscal base).
  {
    const { seedPoliticalLegislationBaseline } =
      await import("@/lib/admin/seed/seedPoliticalLegislation");
    const { resolveWorldSeedYear } = await import("@/lib/era/context");
    await seedPoliticalLegislationBaseline(db, log, await resolveWorldSeedYear(db, preset));
  }
  await seedCNWiki(db);
  await seedNGWiki(db);
  await seedIeBudgets(db, resetReference, log, preset);
  await seedNgBudgets(db, resetReference, log, preset);
  await guarded("reanchorBackgroundRegionalMacro2027", () =>
    reanchorBackgroundRegionalMacro2027(db, preset, log)
  );
  // Materialize scalar debt.principal into tradeable sovereign bond series.
  // Must run after every national-budget + NatCorp seeder so surplus countries
  // open with a bond float matching their debt rather than orphaned principal.
  if (preset === "2027-default")
    await (await import("./seed/seedUS2027Grants")).seedUS2027Grants(db);
  await guarded("seedSovereignBondInstruments", () => seedSovereignBondInstruments(db, log, 0));
  await (await import("./seed/seedCaOpeningFinance")).seedCaOpeningFinance(db, preset);
  await seedCountryGameStates(db, preset, getStartingYearForPreset(preset), log);
  await worldEntityStatesCollection<Document>(db).deleteMany({});
  await federationSettlementApplicationsCollection<Document>(db).deleteMany({});
  await seedMacroCountries(db, preset, log);
  await reconcileSignedTariffBills(db);

  // Capture FY2020 baseline snapshot so the budget history dropdown has an initial entry
  await guarded("seedInitialBudgetSnapshots", () => seedInitialBudgetSnapshots(db, log));
  await seedSeats(db, resetReference, log, preset);
  // US-only, preset-gated. No-ops until per-preset SCOTUS content exists.
  await seedScotus(db, log, preset, resetReference);
  await seedNGGovernors(db, resetReference, log, preset);
  await seedPartyBudgets(db, resetReference, log);
  // Reg/Org bootstrap: every per-(state, party) `statePartyOrg` row exists
  // by this point. Seed registration shares + non-party pool from the
  // curated lane templates for the active preset. Unknown presets skip.
  await seedRegistrationLanes(db, preset, log);
  // Command-economy state enterprises need plant coverage in every sector, so
  // they are completed once the region GDP seeders above have run.
  await guarded("reconcileCommandEconomySoes", async () => {
    await reconcileCommandEconomySoes(db, { preset, log });
  });
  await guarded("seedUnions", () => seedUnions(db, log, preset, resetReference));
  await seedIndexes(db, log);
  await seedCountyMapData(log);
  // Baseline commodity prices: one row per CommodityType at base price. Runs
  // before seedOnly returns because these are reference rows, not gameplay
  // state. The runtime turn processor takes over price movement from here.
  // The `preset` arg is development's — commodity baselines are era-authored.
  await guarded("seedCommodityPrices", () =>
    seedCommodityPrices(db, resetReference, log, preset, { usePresetOpeningPrices: !seedOnly })
  );

  // Forex layer: exchange rates + central banks + money-supply baselines +
  // indexes + the gameState flag.
  //
  // MUST stay ABOVE the seedOnly return. `resetGameWorld` deletes
  // `exchangeRates` and `centralBanks`, and this is their only re-seeder, so
  // placing it below leaves Reset Only and Delete All Data worlds with no
  // forex data or indexes. Do not move it below the return.
  //
  // Only the closing flag write touches gameState, so this does not depend on
  // `initializeGameState` running first; every caller already seeds the doc.
  await guarded("seedForex", () => seedForex(db, log, preset));

  // Seed NPP-run market corporations now that commodity prices and forex exist. Player-enabled countries get 1 corp/sector,
  // econ-preview market democracies get 2/sector; planned economies are excluded
  // (their SOEs come from the budget seeders). MUST stay below seedForex (each
  // corp converts through getCorpFxRate) and above generateStockExchangeSnapshots so the corps appear
  // in the initial exchange snapshot. Runs before the seedOnly gate so seed-only
  // worlds are populated too — corps are economic, not political.
  await guarded("seedNppCorporations", async () => {
    const { seedNppCorporations } = await import("@/lib/admin/seed/seedNppCorporations");
    const r = await seedNppCorporations(db, preset, getStartingYearForPreset(preset), log);
    log(`NPP corporations seeded: ${r.totalSpawned} corps`);
  });

  // NPC retail banks: NPP financial corps + real issueCharter path. After
  // seedNppCorporations / seedForex so HQ states, FX, and capital maths work.
  // Idempotent; not gated on privateBankingEnabled (runtime flag gates policy).
  await guarded("seedNpcBanks", async () => {
    const { seedNpcBanks } = await import("@/lib/admin/seed/seedNpcBanks");
    const r = await seedNpcBanks(db, log);
    log(
      `NPC banks seeded: created=${r.created} existing=${r.skippedExisting} ` +
        `excludedNoState=${r.excludedMissingState.length}` +
        (r.excludedMissingState.length > 0
          ? ` (${r.excludedMissingState.map((e) => `${e.countryId}:${e.reason}`).join(", ")})`
          : "")
    );
  });

  // Currency unions are applied only after every budget, bond, corporation and
  // wallet seed has written its authored legacy denomination. This one pass
  // preserves anchor value while making the selected era internally coherent.
  await guarded("applyEraCurrencyTopology", async () => {
    const { applyEraCurrencyTopology } = await import("@/lib/admin/seed/applyEraCurrencyTopology");
    await applyEraCurrencyTopology(db, preset, log);
  });
  if (startingParties !== "default" && seedOnly) {
    await clearStartingPolitics(db, preset, startingParties === "no-npps");
    log("Cleared starting politics; economic NPP ownership retained with independent affiliation");
  }

  await gameStateCollection(db).updateOne(
    { _id: "current" },
    {
      $set: { startingPartiesMode: startingParties },
      ...(noStartingParties && !preIteration ? { $unset: { preIteration: "" as const } } : {}),
    }
  );

  if (seedOnly) {
    log("Seed-only complete — skipped elections, officials, and game state init");
    return;
  }

  const gameState = await initializeGameState();
  if (gameState.startingPartiesMode !== startingParties) {
    await gameStateCollection(db).updateOne(
      { _id: "current" },
      { $set: { startingPartiesMode: startingParties } }
    );
  }
  // On an empty database the metric seed writers ran before this doc existed,
  // so their income vintage stamps were dropped. seedAllCountryData above wrote
  // this preset's incomes in this run; re-apply the matching stamps.
  const { stampSeededIncomeVintages } = await import("@/lib/admin/seed/incomeStartVintage");
  await stampSeededIncomeVintages(db, preset);
  log(`Game state ready at turn ${gameState.currentTurn}`);
  const coldWarFoundation = await seedColdWarFoundations(
    db,
    gameState.currentYear ?? getStartingYearForPreset(preset),
    gameState.currentTurn,
    { presetId: preset }
  );
  log(
    `Cold War foundation: ${coldWarFoundation.programsInserted} programmes, ${coldWarFoundation.conflictsInserted} campaigns`
  );

  // Build the initial stock-exchange snapshot so the market page is populated
  // immediately after a reset, even while the game is paused / in maintenance.
  // Both the per-turn rebuild and the refresh cron skip while paused, so
  // without this a freshly-reset world shows an empty exchange. Idempotent.
  //
  // ⚠️ MUST stay BELOW `seedForex`. This converts each corp through
  // `getCorpFxRate`, which returns 1.0 when no rate document exists, so built
  // first the snapshot mixes converted and unconverted units and does not
  // self-heal (rebuild paths skip while paused).
  await guarded("generateStockExchangeSnapshots", () =>
    generateStockExchangeSnapshots(gameState.currentTurn, db)
  );
  log("Built initial stock-exchange snapshot");

  // Run the idempotent fund-definition bootstrap migrations so the fund docs
  // exist on a fresh world.
  const forceIndexFundBootstrap =
    (await indexFundsCollection<Document>(db).countDocuments({}, { limit: 1 })) === 0;
  const indexFundBootstrap = await runMigrations(db, {
    migrations: MIGRATIONS,
    dryRun: false,
    // resetGameWorld drops indexFunds and indexFundPositions together. Their
    // historical migration markers deliberately survive, so force these
    // idempotent bootstraps to recreate a clean definition + reserve ledger.
    force: forceIndexFundBootstrap,
    only: [
      "2026-06-01-index-fund-foundation",
      "2026-06-01-index-fund-seed",
      "2026-06-02-index-fund-real-bonds",
      "2026-09-03-equity-market-pools",
    ],
  });
  log(`Bootstrap migrations: ran ${indexFundBootstrap.ranIds.length}`);

  const [officialsCount, nppsCount] = await Promise.all([
    electedOfficialsCollection<Document>(db).countDocuments(),
    nppsCollection<Document>(db).countDocuments({ retiredAt: null }),
  ]);

  if (mode === "vacant" || globallyVacant) {
    if (officialsCount === 0) {
      const result = await initializeOfficials(db);
      log(result.message);
    } else {
      log(`Skipped vacant-world official bootstrap (${officialsCount} officials already exist)`);
    }
    // In a pre-iteration founding reset, ALWAYS seed the priors candidate pool
    // even if a country seeder (e.g. seedNGGovernors) already created a handful
    // of officials/NPPs during seedAllCountryData — otherwise this gate skips the
    // whole historical seed and the founding elections start with almost no
    // candidate field. Priors mode only creates unseated NPPs (no electedOfficials),
    // so there is no double-seat risk from running it here.
  } else if (
    shouldSeedHistoricalOfficials({
      mode,
      preIteration,
      preExistingOfficials: preExistingOfficialsCount,
      preExistingNpps: preExistingNppsCount,
    })
  ) {
    const result = await seedHistoricalOfficials(
      db,
      preset,
      preIteration ? "priors" : "winners",
      log
    );
    log(
      `Seeded ${preIteration ? "priors (candidate pool, vacant chambers) for" : "historical world:"} ${
        result.officialsCreated
      } officials, ${result.nppsCreated} NPPs`
    );
  } else {
    log(
      `Skipped historical officeholder bootstrap (${preExistingOfficialsCount} officials, ` +
        `${preExistingNppsCount} NPPs already existed before this run; ` +
        `${officialsCount} officials / ${nppsCount} NPPs now)`
    );
  }

  // Backfill preset national executives independently of the gate above.
  // The gate legitimately skips seed-only / partially-populated worlds, and
  // legislatures and most executives refill through election resolution, but a
  // preset-defined executive with no near-term race sits vacant: the 1953 US
  // President + VP (1952 Republican landslide) and BR President (PTB ticket from
  // the 1950 election) never seat because the US cycle anchors to 1956 and BR
  // perpetual elections only spawn chamber races.
  // Seed missing president/VP rows per country from the preset roster.
  // Idempotent (per-country existence check) and scoped to president/VP so
  // legislatures can't double-seat against election-seated deputies.
  // In a pre-iteration founding reset the executive is elected by the founding
  // election (a president cycle-0 race), so do NOT pre-seat it here.
  if (mode !== "vacant" && !globallyVacant && !preIteration) {
    const executiveSeats = getPresetSeats(preset).filter(
      (s) => s.officeType === "president" || s.officeType === "vicePresident"
    );
    if (executiveSeats.length > 0) {
      // Group by country code carried in `state` for national offices.
      const byCountry = new Map<string, typeof executiveSeats>();
      for (const seat of executiveSeats) {
        const list = byCountry.get(seat.state) ?? [];
        list.push(seat);
        byCountry.set(seat.state, list);
      }
      for (const [countryId, seats] of byCountry) {
        const existingExecutive = await electedOfficialsCollection<Document>(db).countDocuments({
          officeType: { $in: ["president", "vicePresident"] },
          countryId,
        });
        if (existingExecutive === 0) {
          const execResult = await seedFromSeats(db, seats);
          log(
            `Seeded ${countryId} national executive: ${execResult.officialsCreated} officials, ${execResult.nppsCreated} NPPs`
          );
        }
      }
    }

    // Same backfill for the RU executive pair (Premier + Chairman of the
    // Presidium): the Cold-War presets define them in the SU seat arrays, but
    // the historical gate above may have been taken. Idempotent + RU-scoped.
    const ruExecutiveSeats = getPresetSeats(preset).filter(
      (s) => s.officeType === "premier" || s.officeType === "chairmanOfPresidium"
    );
    if (ruExecutiveSeats.length > 0) {
      const existingRuExecutive = await electedOfficialsCollection<Document>(db).countDocuments({
        officeType: { $in: ["premier", "chairmanOfPresidium"] },
        countryId: "RU",
      });
      if (existingRuExecutive === 0) {
        const execResult = await seedFromSeats(db, ruExecutiveSeats);
        log(
          `Seeded RU executive: ${execResult.officialsCreated} officials, ${execResult.nppsCreated} NPPs`
        );
      }
    }

    // Formation docs must follow the executive seed so the Premier / President
    // NPP exists to link (RU starts FORMED; BR links the seeded PTB president).
    await seedRUGovernmentFormation(db, log, preset);
    await seedBRGovernmentFormation(db, log);
  }

  // Econ-tier democracies (FR/IT/ES/SE/TR) run election cycles but have no
  // authored chambers in historicalSeats.ts, so cycles resolve empty without
  // candidate supply. Seed statePartyOrg presence + a minimal
  // major-party incumbent roster. Skipped for the deliberately-empty "vacant"
  // world; priors (founding) mode seeds presence only and leaves chambers
  // vacant for the founding elections.
  if (mode !== "vacant" && !globallyVacant) {
    const { seedEconTierRosters, seedEconTierRostersForCountry } =
      await import("@/lib/admin/seed/seedEconTierRosters");
    const econRosters = await seedEconTierRosters(
      db,
      preIteration ? "priors" : "winners",
      log,
      preset
    );
    log(
      `Seeded econ-tier rosters (FR/IT/ES/SE/TR): ${econRosters.orgRows} org rows, ` +
        `${econRosters.nppsCreated} NPPs, ${econRosters.officialsCreated} officials`
    );

    // UK's Commons starts vacant in "1953-default" and "1979-default" per
    // getPresetSeats(). Every other preset gets UK_COMMONS_1987/2020 from
    // historicalSeats.ts via the historical gate, so calling this unconditionally
    // would fabricate duplicate incumbents. The preset gate expresses WHICH presets
    // leave the Commons vacant rather than relying on dedup. UK is player-enabled,
    // not econ-tier, so it gets its own scoped call reusing the same seeder.
    if (preset === "1953-default" || preset === "1979-default") {
      // seedOrgRows: false — `seedUKStatePartyOrg` (run earlier in this
      // bootstrap) already seeded UK's real, regionally-calibrated
      // statePartyOrg rows (era polling per region, SNP/Plaid/Sinn Féin
      // confined to their home region). Letting this call's org-row step run
      // too overwrites that data with a flat nationwide grid and re-adds
      // presence rows for the regionally-confined parties everywhere.
      // Only the incumbent-seat step (below) is what UK actually needs from
      // this seeder.
      const ukRoster = await seedEconTierRostersForCountry(
        db,
        "UK",
        preIteration ? "priors" : "winners",
        log,
        { seedOrgRows: false }
      );
      log(
        `Seeded UK ${preset} Commons roster: ${ukRoster.orgRows} org rows, ` +
          `${ukRoster.nppsCreated} NPPs, ${ukRoster.officialsCreated} officials`
      );
    }
    if (preset === "1991-default") {
      const { seed1991FederationLegislatures } =
        await import("./seed/seed1991FederationLegislatures");
      await seed1991FederationLegislatures(db, preset, preIteration ? "priors" : "winners", log);
    }
  }

  // Seed governorOfficeState rows for every regional executive seat so the
  // office AP system and Devolution Policy defaults are in place before the
  // first action. Idempotent — safe to run alongside vacant/historical seeds.
  if (startingParties !== "default")
    await clearStartingPolitics(db, preset, startingParties === "no-npps");

  const officeStateResult = await seedOfficeStates(db, gameState.currentTurn, preset);
  log(
    `Seeded office states: ${officeStateResult.inserted} inserted, ${officeStateResult.skipped} skipped`
  );

  const now = new Date();
  // Every spawner below opens with the same GameState read; read it once for
  // the whole battery. Sound because bootstrap runs no turns and all gameState
  // writes on this path finish before the battery starts. The scope is the
  // callback's dynamic extent only; per-turn callers must not use it.
  // Countries run concurrently; families within a country stay in order.
  // No family mirrors a race in a different country.
  // Background countries hold no full-engine elections, so their spawners are
  // replaced by a no-op.
  const forCountry =
    (countryId: string, run: () => Promise<void>): (() => Promise<void>) =>
    async () => {
      if (!isBackgroundInPreset(preset, countryId)) await run();
    };
  await guarded("electionBattery", () =>
    withElectionGameStateSnapshot(db, async () => {
      await Promise.all(
        [
          async () => {
            await ensurePerpetualElections(now, gameState.currentTurn);
          },
          forCountry("CA", async () => {
            await ensureCAElections(now, gameState.currentTurn);
            await ensureCAProvincialElections(now, gameState.currentTurn);
            await ensureCAPremierElections(now, gameState.currentTurn);
          }),
          forCountry("UK", async () => {
            await ensureUKElections(now);
          }),
          forCountry("JP", async () => {
            await ensureJPElections(now);
          }),
          forCountry("DE", async () => {
            await ensureDEElections(now);
          }),
          forCountry("BR", async () => {
            await ensureBRElections(now);
            await ensureBRGovernorElections(now);
          }),
          forCountry("NG", async () => {
            await ensureNGElections(now);
          }),
          forCountry("IE", async () => {
            await ensureIEElections(now);
            await ensureIEUachtaranElections(now);
            await ensureIELocalCouncilElections(now);
            await ensureIECathaoirleachElections(now);
          }),
          forCountry("CN", async () => {
            await ensureCNElections(now);
            await ensureCNPeoplesCongressElections(now);
            await ensureCNGovernorElections(now);
          }),
          // RU (status+era gated — no-ops unless the preset enables the Soviet Union).
          forCountry("RU", async () => {
            await ensureRUSupremeSovietElections(now);
            await ensureRUNationalitiesElections(now);
            await ensureRURepublicSovietElections(now);
            await ensureRUGovernorElections(now);
          }),
          // DD (status+era gated — no-ops unless the preset enables East Germany).
          forCountry("DD", async () => {
            await ensureDDVolkskammerElections(now);
            await ensureDDGovernorElections(now);
          }),
          // Beta parliamentary countries: status-gated no-ops unless the country is
          // beta/active; ES additionally era-gated (1953: no elections). Upper chambers
          // stay after their lower chamber; SE is unicameral since 1970, no Senate.
          forCountry("FR", async () => {
            await ensureFRElections(now);
            await ensureFRSenateElections(now);
          }),
          forCountry("IT", async () => {
            await ensureITElections(now);
            await ensureITSenateElections(now);
          }),
          forCountry("ES", async () => {
            await ensureESElections(now);
            await ensureESSenateElections(now);
          }),
          forCountry("SE", async () => {
            await ensureSEElections(now);
          }),
          forCountry("TR", async () => {
            await ensureTRElections(now);
            await ensureTRSenateElections(now);
          }),
        ].map((run) => run())
      );
    })
  );

  // Seat every chair-synced ceremonial head of state from its ruling party's chairId
  // — the CN President and the Warsaw Pact council chairmanships. The turn pipeline
  // re-runs this every turn; seeding it here makes a freshly bootstrapped world
  // correct before turn 1 fires, rather than showing "Vacant" until the first tick.
  const { syncAllPartyChairHeadsOfState } = await import("@/lib/turn/partyChairHeadOfState");
  const chairHosResults = globallyVacant
    ? []
    : await syncAllPartyChairHeadsOfState(db, now, preset);
  const seated = chairHosResults.filter((r) => r.action !== "noop");
  log(
    `Party-chair head-of-state sync (bootstrap): ${seated.length}/${chairHosResults.length} seated ` +
      `(${seated.map((r) => `${r.countryId}:${r.action}`).join(", ") || "none"})`
  );

  // Bootstrap JP Sangiin elections — both classes for all regions, anchored to LARP calendar.
  // Class 1 ends Turn 123 (Jul 2022), Class 2 ends Turn 267 (Jul 2025).
  // ensureJPCouncillorElections uses duration-based timing (not LARP-anchored), so we
  // create the bootstrap elections directly like sync-date does.
  //
  // Pre-iteration: this LARP-anchored inline path would stagger the two Sangiin
  // classes (Jul 2022 / Jul 2025) instead of founding them together. Route
  // through the founding-aware ensureJPCouncillorElections instead, which spawns
  // both classes as a synchronized cycle-0 race like every other body.
  if (preIteration) {
    await ensureJPCouncillorElections(now);
    log("Spawned JP Sangiin founding elections (both classes, cycle 0)");
  } else {
    const jpRegions = await statesCollection<Document>(db)
      .find({ countryId: "JP" }, { projection: { _id: 1 } })
      .toArray();
    const sangiinDur = DEFAULT_DURATIONS.sangiin;
    const sangiinToInsert: Omit<Election, "_id">[] = [];

    for (const region of jpRegions) {
      const regionId = String(region._id);

      for (const chamberClass of [1, 2] as const) {
        // Check if election already exists for this region + class
        const existing = await electionsCollection<Document>(db).findOne({
          electionType: "sangiin",
          countryId: "JP",
          chamberClass,
          state: regionId,
          status: { $in: ["active", "upcoming"] },
        });
        if (existing) continue;

        const presetAnchors = getCycleAnchors({
          startingYear: getStartingYearForPreset(preset),
          preset,
        });
        const endTurn =
          chamberClass === 2 ? presetAnchors.jpSangiinClass2 : presetAnchors.jpSangiinClass1;
        const endTime = new Date(now.getTime() + endTurn * MS_PER_TURN);
        const primaryEndTime = new Date(
          endTime.getTime() - sangiinDur.generalDurationHours * MS_PER_TURN
        );
        // Absolute turn bounds mirroring the Dates above (turnToWallClock
        // invariant: turn = currentTurn + offset-from-now). `endTurn` here is
        // the offset-from-now anchor, not an absolute turn.
        const endTurnAbs = gameState.currentTurn + endTurn;
        const primaryEndTurnAbs = endTurnAbs - sangiinDur.generalDurationHours;

        sangiinToInsert.push({
          countryId: "JP",
          electionType: "sangiin",
          state: regionId,
          chamberClass,
          seatId: getSeatIdFromElection({
            countryId: "JP",
            electionType: "sangiin",
            state: regionId,
            chamberClass,
          }),
          cycle: 1,
          electionYear: electionToLarpYear("sangiin", 1, undefined, chamberClass, {
            startingYear: getStartingYearForPreset(preset),
            preset,
          }),
          status: "active",
          totalSeats: getJpSangiinClassSeats(preset, regionId, chamberClass),
          startTime: now,
          primaryEndTime,
          endTime,
          startTurn: gameState.currentTurn,
          primaryEndTurn: primaryEndTurnAbs,
          endTurn: endTurnAbs,
          durationHours: sangiinDur.durationHours,
          primaryDurationHours: sangiinDur.primaryDurationHours,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (sangiinToInsert.length > 0) {
      await electionsCollection(db).insertMany(
        sangiinToInsert.map(withCampaignRules) as Election[]
      );
      log(`Spawned ${sangiinToInsert.length} JP Sangiin elections (both classes, all regions)`);
    }
  }

  if (!skipRegionalCouncil) {
    await ensureUKRegionalCouncilElections(now);
    log("Ensured UK Regional Council elections");
  }

  // ── Founding spawn sweep (pre-iteration only) ──────────────────────────────
  // The hand-maintained ensure* battery above has drifted from the registry the
  // TURN LOOP iterates, and the turn loop suppresses every canonical spawner
  // while the founding phase is active — so anything the battery misses would
  // stay vacant for the entire phase (on 1953-default: the whole Warsaw Pact).
  // Re-drive the spawn from that registry instead. Idempotent + status/era
  // gated, so this is a no-op for the families already spawned above.
  // See `spawnFoundingElections` for the full rationale.
  if (preIteration) {
    const { spawnFoundingElections } = await import("@/lib/turn/foundingElections");
    // Same GameState snapshot the ensure* battery uses. The sweep drives all 54
    // families through the same `getCurrentTurnAndCtx` funnel, so without a
    // scope it re-read gameState once per family. This was measured as 53 of the reset's
    // gameState reads. Sound for the same reason the battery is: bootstrap runs
    // no turns, every gameState write on this path has already happened, and
    // `spawnFoundingElections` never writes it.
    await guarded("spawnFoundingElections", () =>
      withElectionGameStateSnapshot(db, async () => {
        const result = await spawnFoundingElections(db, now, { skipRegionalCouncil, log, preset });
        if (result.failed > 0) {
          throw new Error(`${result.failed} founding election family/families failed to spawn`);
        }
        if (result.foundingRaces === 0) {
          throw new Error("Founding election sweep produced zero cycle-0 races");
        }
        return result;
      })
    );

    // General NPP priors population - makes the founding candidate pool
    // independent of historicalSeats.ts, which only authors a roster for a
    // handful of countries (US/RU/CN/DD + Warsaw Pact six under 1953-default).
    // Every other seeded country's founding elections would otherwise have no
    // candidates at all. Runs AFTER the founding sweep so it can size each
    // region's population from its real cycle-0 RACE count (one candidate per
    // race, not per seat - sizing off seat counts produced a 29k-NPP inert
    // bench) rather than any hardcoded per-country number. Additive/idempotent: only
    // tops up parties/regions short of their target, and - like every other
    // priors path - never writes `electedOfficials`.
    const { seedNppPriorsPopulation } = await import("@/lib/npp/seedNppPriorsPopulation");
    const priorsPopulation = await seedNppPriorsPopulation(db, log);
    log(
      `NPP priors population: ${priorsPopulation.nppsCreated} NPPs added across ` +
        `${Object.keys(priorsPopulation.byCountry).length} countries`
    );
  }

  if (startingParties !== "default")
    await clearStartingPolitics(db, preset, startingParties === "no-npps");

  // Only a genuinely fresh historical world receives this candidate bench.
  // Reference refreshes and existing live worlds retain their actor population.
  if (
    !globallyVacant &&
    !preIteration &&
    shouldSeedHistoricalOfficials({
      mode,
      preIteration,
      preExistingOfficials: preExistingOfficialsCount,
      preExistingNpps: preExistingNppsCount,
    })
  ) {
    const { seedModernPartyBench } = await import("@/lib/npp/seedModernPartyBench");
    await seedModernPartyBench(db, preset, log);
    const { seedModernOpeningCandidates } = await import("@/lib/npp/seedModernOpeningCandidates");
    await seedModernOpeningCandidates(db, preset, now, log);
    if (startingParties === "default") {
      const { seedCaOpeningGovernment } = await import("@/lib/countries/ca/seedOpeningGovernment");
      await seedCaOpeningGovernment(db, preset, log);
      const { seedCaElectionBench } = await import("@/lib/countries/ca/seedElectionBench");
      await seedCaElectionBench(db, preset, log);
    }
  }

  const [stateCount, seatCount, electionCount, officialCount, partyBudgetCount] = await Promise.all(
    [
      statesCollection<Document>(db).countDocuments(),
      seatsCollection<Document>(db).countDocuments(),
      electionsCollection<Document>(db).countDocuments(),
      electedOfficialsCollection<Document>(db).countDocuments(),
      partyBudgetCollection<Document>(db).countDocuments(),
    ]
  );

  const summary = {
    states: stateCount,
    seats: seatCount,
    elections: electionCount,
    electedOfficials: officialCount,
    partyBudget: partyBudgetCount,
  };

  log("Bootstrap summary:");
  log(`- states: ${summary.states}`);
  log(`- seats: ${summary.seats}`);
  log(`- elections: ${summary.elections}`);
  log(`- electedOfficials: ${summary.electedOfficials}`);
  log(`- partyBudget: ${summary.partyBudget}`);

  return summary;
}

export { stampInitialGameClock } from "./stampInitialGameClock";
