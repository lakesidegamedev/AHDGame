/**
 * Apply the economy-only reset.
 *
 * Pauses the world and takes the processing lock, rebuilds the plan and
 * refuses unless its digest equals the reviewed census digest, then runs the
 * phases in order. Each finished phase is recorded on the gameState marker, so
 * a retry after a failure resumes from the stored plan instead of repeating
 * work, and an apply of an already completed digest is a no-op. All wipes are
 * deletes, all reseeds are upserts, and treasury credits carry a per-budget
 * digest guard. The world is left paused for an operator.
 */
import {
  MongoServerError,
  ObjectId,
  type AnyBulkWriteOperation,
  type Db,
  type Document,
} from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import { collectBalances } from "@/lib/ledger/balanceSnapshot";
import { LEDGER_ENTRIES_COLLECTION, finalizeLedgerEntry } from "@/lib/ledger/emit";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { SOVEREIGN_COUPON_CLAIMS_COLLECTION } from "@/lib/banking/fundedSovereignCoupons";
import { MIGRATIONS } from "@/lib/migrations/registry";
import { runMigrations } from "@/lib/migrations/runner";
import {
  economyResetFullWipeCollections,
  type EconomyResetFullWipeCollection,
} from "./collections";
import {
  CORPORATE_BOND_FILTER,
  ECONOMY_RESET_PROCESSING_KIND,
  VOIDED_INCOME_TAX_FILTER,
  captureEconomyResetPlan,
} from "./census";
import { economyResetObjectId } from "./digest";
import {
  CENTRAL_BANK_HISTORY_RESET,
  FRESH_PLANTS_GAME_STATE_TURN_ANCHORS,
  freshPlantsGameConfigUpdate,
} from "./freshWorldConfig";
import { loadEconomyResetPlan, storeEconomyResetPlan } from "./planStore";
import { isPrivateMaturityLeg, keptCouponHolders } from "./rules/bonds";
import { primaryLegTotals, witnessDeltas, witnessEntry } from "./rules/ledger";
import { NPP_MONEY_UNSET, characterMoneyUpdate, imperialMoneyUpdate } from "./rules/money";
import {
  ECONOMY_RESET_FUND_MIGRATIONS,
  ECONOMY_RESET_INDEX_MIGRATIONS,
  reseedCountryOwnedCorporations,
  loadDissolvedFederations,
} from "./reseed";
import {
  ECONOMY_RESET_PHASES,
  type EconomyResetMarker,
  type EconomyResetPhase,
  type EconomyResetPlan,
} from "./types";

type Log = (message: string) => void;

/** Sector-derived region caches; the macro state (capitalStock, outputGap) is kept. */
const STATE_SECTOR_UNSET_FIELDS: readonly string[] = Object.freeze([
  "sectorRealizedRevenue",
  "sectorRealizedRevenueTurn",
  "sectorRealizedRevenueUnit",
  "sectorRevenueEma",
  "sectorRevenueSnapshots",
  "sectorOutputEma",
  "sectorOutputSnapshots",
  "corpGrowthInvestmentAnchor",
  "corpGrowthInvestmentTurn",
  "topSectorsCache",
]);

const WRITE_CHUNK = 1000;

export interface ApplyEconomyResetOptions {
  expectedWorldEpoch: string;
  approvalReference: string;
  approvedDigest: string;
  log?: Log;
  /** Heartbeat interval in ms; tests shorten it. */
  heartbeatMs?: number;
}

export interface ApplyEconomyResetResult {
  digest: string;
  noop: boolean;
  phasesRun: EconomyResetPhase[];
  diagnosticFailures: number;
  witnessEntries: number;
}

function oid(id: string): ObjectId {
  return new ObjectId(id);
}

function chunks<T>(rows: T[], size = WRITE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function bulk(db: Db, collection: string, ops: AnyBulkWriteOperation<Document>[]) {
  for (const batch of chunks(ops))
    if (batch.length > 0) await db.collection(collection).bulkWrite(batch, { ordered: false });
}

async function dropIfExists(db: Db, name: EconomyResetFullWipeCollection): Promise<void> {
  try {
    await db.collection(name).drop();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 26) return;
    throw error;
  }
}

function gameState(db: Db) {
  return db.collection<GameState>("gameState");
}

// --- Phases ----------------------------------------------------------------

async function phaseHolders(db: Db, plan: EconomyResetPlan): Promise<void> {
  await bulk(
    db,
    "characters",
    plan.characters.map((patch) => ({
      updateOne: {
        filter: { _id: oid(patch.id) },
        update: characterMoneyUpdate(patch, plan.currentTurn),
      },
    }))
  );
  const imperials = await db
    .collection<Document>("imperialCharacters")
    .find({}, { projection: { initialIncomeTier: 1 } })
    .toArray();
  await bulk(
    db,
    "imperialCharacters",
    imperials.map((row) => ({
      updateOne: {
        filter: { _id: row._id },
        update: imperialMoneyUpdate(row.initialIncomeTier, plan.currentTurn),
      },
    }))
  );
  await db.collection("npps").updateMany(
    {
      $or: [
        { currencyBalances: { $exists: true } },
        { nppInvestmentCashAnchor: { $exists: true } },
        { lastIndexFundInvestmentTurn: { $exists: true } },
      ],
    },
    { $unset: { ...NPP_MONEY_UNSET } }
  );
  await db
    .collection("npps")
    .updateMany(
      { lineOfCredit: { $exists: true } },
      { $set: { lineOfCredit: { balances: {}, arrears: {} } } }
    );
  await db
    .collection("users")
    .updateMany(
      { lastCorporationFoundedTurn: { $exists: true } },
      { $unset: { lastCorporationFoundedTurn: "" } }
    );
  await bulk(
    db,
    "pensionSchemes",
    plan.pensionConversions.map((row) => ({
      updateOne: {
        filter: { _id: oid(row.id) },
        update: {
          $set: {
            assetsAnchor: row.assetsAnchorBefore + row.investedValueAnchor,
            investedValueAnchor: 0,
          },
        },
      },
    }))
  );
}

async function phaseBonds(db: Db, plan: EconomyResetPlan): Promise<void> {
  await bulk(
    db,
    "bonds",
    plan.sovereignBonds.map((bond) => ({
      updateOne: {
        filter: { _id: oid(bond.id), issuerType: "sovereign" },
        update: { $set: { holders: [], publicFloat: bond.publicFloatAfter } },
      },
    }))
  );
  for (const ids of chunks(plan.corporateBondIds.map(oid), 5000)) {
    await db.collection("bondHistory").deleteMany({ bondId: { $in: ids } });
    await db.collection("bonds").deleteMany({ _id: { $in: ids }, ...CORPORATE_BOND_FILTER });
  }

  const claims = db.collection<{ _id: string; claim: Document }>(
    SOVEREIGN_COUPON_CLAIMS_COLLECTION
  );
  const deleteIds = plan.couponClaims.filter((c) => c.action === "delete").map((c) => c.id);
  for (const ids of chunks(deleteIds, 5000)) await claims.deleteMany({ _id: { $in: ids } });
  const trimIds = plan.couponClaims.filter((c) => c.action === "trim").map((c) => c.id);
  for (const ids of chunks(trimIds, 5000)) {
    const rows = await claims.find({ _id: { $in: ids } }).toArray();
    await bulk(
      db,
      SOVEREIGN_COUPON_CLAIMS_COLLECTION,
      rows.map((row) => {
        const kept = keptCouponHolders(
          row.claim.holders as { kind: string; amountLocal: number }[]
        );
        return {
          updateOne: {
            filter: { _id: row._id as never },
            update: {
              $set: {
                "claim.holders": kept,
                "claim.amountLocal": kept.reduce((sum, h) => sum + h.amountLocal, 0),
              },
            },
          },
        };
      })
    );
  }

  // Unpaid maturity quotes drop their private legs and holders; the quote
  // shrinks by the planned amount, and any funded escrow stays on the bond.
  for (const patches of chunks(plan.maturityClaims, 1000)) {
    const bonds = await db
      .collection<Document>("bonds")
      .find(
        { _id: { $in: patches.map((patch) => oid(patch.bondId)) } },
        { projection: { "sovereignMaturityClaim.holderLegs": 1 } }
      )
      .toArray();
    const byId = new Map(patches.map((patch) => [patch.bondId, patch]));
    await bulk(
      db,
      "bonds",
      bonds.map((bond) => {
        const patch = byId.get(String(bond._id))!;
        const legs = (bond.sovereignMaturityClaim?.holderLegs ?? []) as { collection: string }[];
        return {
          updateOne: {
            filter: { _id: bond._id, "sovereignMaturityClaim.paid": { $ne: true } },
            update: {
              $set: {
                "sovereignMaturityClaim.holderLegs": legs.filter(
                  (leg) => !isPrivateMaturityLeg(leg)
                ),
                "sovereignMaturityClaim.sourceHolders": [],
                "sovereignMaturityClaim.amountLocal": patch.amountLocalAfter,
              },
            },
          },
        };
      })
    );
  }

  if (plan.legacyCouponClaims.length > 0) {
    const budgets = await db
      .collection<Document>("federalBudget")
      .find(
        { _id: { $in: plan.legacyCouponClaims.map((row) => row.budgetId) } as never },
        { projection: { sovereignCouponClaims: 1 } }
      )
      .toArray();
    const changed = new Map(
      plan.legacyCouponClaims.map((row) => [row.budgetId, new Set(row.claimIds)])
    );
    await bulk(
      db,
      "federalBudget",
      budgets.map((budget) => {
        const ids = changed.get(String(budget._id)) ?? new Set<string>();
        const next = (budget.sovereignCouponClaims ?? []).flatMap((claim: Document) => {
          if (!ids.has(String(claim.id))) return [claim];
          const kept = keptCouponHolders(claim.holders as { kind: string; amountLocal: number }[]);
          if (kept.length === 0) return [];
          return [
            {
              ...claim,
              holders: kept,
              amountLocal: kept.reduce((sum, h) => sum + h.amountLocal, 0),
            },
          ];
        });
        return {
          updateOne: {
            filter: { _id: budget._id },
            update: { $set: { sovereignCouponClaims: next } },
          },
        };
      })
    );
  }
}

async function phaseCentralBanks(db: Db, plan: EconomyResetPlan): Promise<void> {
  await bulk(
    db,
    "centralBanks",
    plan.centralBanks.map((row) => ({
      updateOne: {
        filter: { _id: row.bankId as never },
        update: { $set: { reserveBalance: row.reserveBalanceAfter } },
      },
    }))
  );
  // Every private deposit is gone; the turn recomputes this from savings.
  await db.collection("centralBanks").updateMany({}, { $set: { nationalSavingsBalance: 0 } });
}

async function phaseTreasury(db: Db, plan: EconomyResetPlan, digest: string): Promise<void> {
  const credit = new Map<string, number>();
  for (const sweep of plan.publicBuyerSweeps)
    credit.set(sweep.budgetId, (credit.get(sweep.budgetId) ?? 0) + sweep.treasuryCredit);
  const release = new Map<string, number>();
  for (const row of plan.defenceReleases) release.set(row.countryId, row.release);
  const budgets = await db
    .collection<Document>("federalBudget")
    .find({}, { projection: { countryId: 1 } })
    .toArray();
  const ops: AnyBulkWriteOperation<Document>[] = [];
  for (const budget of budgets) {
    const amount = credit.get(String(budget._id)) ?? 0;
    const freed = release.get(String(budget.countryId)) ?? 0;
    if (amount === 0 && freed === 0) continue;
    // One guarded write per budget: a retry after a crash cannot credit twice.
    const inc: Record<string, number> = {};
    if (amount !== 0) {
      inc.treasuryBalance = amount;
      if (plan.treasuryCashLedgerEnabled) inc.treasuryCashLocal = amount;
    }
    if (freed > 0) inc["defenseAppropriation.encumbered"] = -freed;
    ops.push({
      updateOne: {
        filter: { _id: budget._id, economyResetDigest: { $ne: digest } },
        update: { $inc: inc, $set: { economyResetDigest: digest } },
      },
    });
  }
  await bulk(db, "federalBudget", ops);
  await db.collection("playerIncomeTaxAssessments").deleteMany(VOIDED_INCOME_TAX_FILTER);
}

/** Stuck partial moves that owe nothing to a kept account are closed as rejected. */
async function phaseMoneyMoves(db: Db, plan: EconomyResetPlan, digest: string): Promise<void> {
  const now = new Date();
  await bulk(
    db,
    "bankMoneyMoves",
    plan.voidedMoneyMoves.map((move) => ({
      updateOne: {
        filter: { _id: move.id as never, status: "partial" },
        update: {
          $set: {
            status: "rejected",
            error: `Voided by economy reset ${digest}: every pending leg targets money the reset removes`,
            economyResetVoidedAt: now,
          },
        },
      },
    }))
  );
}

async function phaseWipe(db: Db): Promise<void> {
  for (const name of economyResetFullWipeCollections()) {
    // Reference rows are deleted so the collection and its indexes stay.
    if (name === "unownedSectors") await db.collection(name).deleteMany({});
    else await dropIfExists(db, name);
  }
}

async function phaseUnset(db: Db, plan: EconomyResetPlan): Promise<void> {
  await gameState(db).updateOne({ _id: "current" }, {
    $unset: { producerOpening: "", lastMarketTickAt: "" },
    $set: Object.fromEntries(
      FRESH_PLANTS_GAME_STATE_TURN_ANCHORS.map((field) => [field, plan.currentTurn])
    ),
  } as never);
  // The rebuilt plants start from fresh-world configuration: gameplay flags on,
  // and no governor, recovery stage, funded lever or turn stamp from the old economy.
  await db
    .collection<Document>("gameConfig")
    .updateOne({ _id: "default" as never }, freshPlantsGameConfigUpdate() as never);
  await db
    .collection("states")
    .updateMany({}, { $unset: Object.fromEntries(STATE_SECTOR_UNSET_FIELDS.map((f) => [f, ""])) });
  // Unions are wiped and reseeded vacant, so no character can still cache
  // leadership of a union that no longer exists. Leaving it set would also
  // block them from founding or taking another union (`foundUnion` 409s while
  // `unionLeaderOf` is non-null) until a later read path repaired it.
  await db
    .collection("characters")
    .updateMany({ unionLeaderOf: { $ne: null } }, { $set: { unionLeaderOf: null } });
  // Each region's employment ledger fixes its corporate job share the first
  // time corporate demand is measured and never revisits it. Kept across a
  // reset, the old economy's share (up to 99% of a state's workforce) stays
  // reserved for jobs the rebuilt plants do not offer, and those workers sit
  // unemployed indefinitely. Marking demand unknown makes the next metric pass
  // re-baseline the share from the rebuilt plants' real demand.
  await db
    .collection("macroMetrics")
    .updateMany(
      { "labourEmployment.corporateDemandKnown": true },
      { $set: { "labourEmployment.corporateDemandKnown": false } }
    );
}

/**
 * Current prices and exchange rates back to their seed values, and the central
 * banks' per-turn series cleared. Chairs, boards, policy rates, reserves and
 * the external money baseline stay. Runs after the witness so the revaluation
 * of kept local balances is never written up as created or destroyed money.
 */
async function phaseReseedPrices(db: Db, plan: EconomyResetPlan, log: Log): Promise<void> {
  const { seedCommodityPrices } = await import("@/lib/admin/seed/seedCommodityPrices");
  await seedCommodityPrices(db, true, log, plan.preset);
  // A federation that dissolved may have moved to a new currency; the seed
  // table only knows the preset's opening one, so the live code is kept.
  const dissolved = await loadDissolvedFederations(db, plan.preset);
  const liveCodes = await db
    .collection<{ _id: string; currencyCode: string }>("exchangeRates")
    .find({ _id: { $in: dissolved } }, { projection: { currencyCode: 1 } })
    .toArray();
  await db.collection("exchangeRates").deleteMany({});
  await db
    .collection("centralBanks")
    .updateMany({}, { $set: { ...CENTRAL_BANK_HISTORY_RESET, updatedAt: new Date() } });
  const { seedForex } = await import("@/lib/admin/seed/seedForex");
  await seedForex(db, log, plan.preset);
  if (liveCodes.length > 0)
    await db.collection<{ _id: string; currencyCode: string }>("exchangeRates").bulkWrite(
      liveCodes.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { currencyCode: row.currencyCode } },
        },
      }))
    );
  // seedForex writes a turn-0 money supply row; the cleared economy was
  // measured at the current turn by the moneySupply phase, so only that stays.
  await db.collection("moneySupplySnapshots").deleteMany({ turn: { $lt: plan.currentTurn } });
}

async function phaseWitness(
  db: Db,
  plan: EconomyResetPlan,
  digest: string,
  startedAt: Date
): Promise<number> {
  if (!plan.ledgerShadow) return 0;
  const [closing, emitted, rates] = await Promise.all([
    collectBalances(db, { treasuryCashLedgerEnabled: plan.treasuryCashLedgerEnabled }),
    db
      .collection<{ legs: { account: string; anchorAmount: number; role: string }[] }>(
        LEDGER_ENTRIES_COLLECTION
      )
      .find(
        {
          turn: plan.ledgerTurn,
          createdAt: { $gte: startedAt },
          emitSite: { $ne: "admin/economyReset" },
        },
        { projection: { legs: 1 } }
      )
      .toArray(),
    db
      .collection<{ currencyCode: string; rate: number }>("exchangeRates")
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .toArray(),
  ]);
  const anchorRates = Object.fromEntries(rates.map((row) => [row.currencyCode, row.rate]));
  const deltas = witnessDeltas({
    opening: plan.openingBalances,
    closing,
    alreadyWitnessed: primaryLegTotals(emitted),
    anchorRates,
  });
  const createdAt = new Date();
  await bulk(
    db,
    LEDGER_ENTRIES_COLLECTION,
    deltas.map((delta) => {
      const entry = { ...finalizeLedgerEntry(witnessEntry(delta, plan.ledgerTurn, createdAt)) };
      const _id = economyResetObjectId(digest, `ledger:${delta.account}`);
      const { _id: _ignored, ...body } = entry;
      return { updateOne: { filter: { _id }, update: { $setOnInsert: body }, upsert: true } };
    })
  );
  return deltas.length;
}

async function phaseDiagnostic(db: Db, plan: EconomyResetPlan, log: Log): Promise<number> {
  const [sovereign, corporations] = await Promise.all([
    db
      .collection<Document>("bonds")
      .find(
        { issuerType: "sovereign", matured: false },
        { projection: { corporationId: 1, countryId: 1 } }
      )
      .toArray(),
    db
      .collection<Document>("corporations")
      .find({}, { projection: { _id: 1, countryOwnerId: 1, isPrimaryNationalCorporation: 1 } })
      .toArray(),
  ]);
  const ids = new Set(corporations.map((row) => String(row._id)));
  // Countries without a national corporation issue under a synthetic id by
  // design; only an issuer that should resolve and does not is a finding.
  const issuers = new Set(
    corporations
      .filter((row) => row.isPrimaryNationalCorporation === true)
      .map((row) => String(row.countryOwnerId))
  );
  const orphaned = sovereign.filter(
    (bond) => issuers.has(String(bond.countryId)) && !ids.has(String(bond.corporationId))
  ).length;
  if (orphaned > 0)
    log(`Economy reset: ${orphaned} sovereign bonds name a national issuer that does not exist`);
  const { checkEconomicOpening } = await import("@/lib/admin/seedDiagnostic/economicOpening");
  const checks = await checkEconomicOpening(db, plan.preset);
  const failures = checks.filter((row) => row.severity !== "ok");
  for (const row of failures.slice(0, 50))
    log(`Economy reset diagnostic: ${row.id} ${row.severity}`);
  return failures.length;
}

async function runPhase(
  db: Db,
  phase: EconomyResetPhase,
  plan: EconomyResetPlan,
  digest: string,
  marker: EconomyResetMarker,
  log: Log
): Promise<{ witnessEntries?: number; diagnosticFailures?: number }> {
  switch (phase) {
    case "holders":
      return phaseHolders(db, plan).then(() => ({}));
    case "bonds":
      return phaseBonds(db, plan).then(() => ({}));
    case "centralBanks":
      return phaseCentralBanks(db, plan).then(() => ({}));
    case "treasury":
      return phaseTreasury(db, plan, digest).then(() => ({}));
    case "moneyMoves":
      return phaseMoneyMoves(db, plan, digest).then(() => ({}));
    case "wipe":
      return phaseWipe(db).then(() => ({}));
    case "unset":
      return phaseUnset(db, plan).then(() => ({}));
    case "indexes": {
      const marketIndexes = MIGRATIONS.filter((m) => ECONOMY_RESET_INDEX_MIGRATIONS.includes(m.id));
      if (marketIndexes.length > 0)
        await runMigrations(db, {
          migrations: marketIndexes,
          dryRun: false,
          only: [...ECONOMY_RESET_INDEX_MIGRATIONS],
          force: true,
        });
      const { seedIndexes } = await import("@/lib/admin/seed/seedIndexes");
      await seedIndexes(db, log);
      return {};
    }
    case "reseedCountryCorporations":
      await reseedCountryOwnedCorporations(db, plan.preset, plan.commandEconomyEnabled, log);
      return {};
    case "reseedUnownedSectors": {
      const { seedUnownedSectors } = await import("@/lib/admin/seed/seedUnownedSectors");
      await seedUnownedSectors(db, log, 1, plan.preset, true);
      return {};
    }
    case "reseedNppCorporations": {
      const { seedNppCorporations } = await import("@/lib/admin/seed/seedNppCorporations");
      const result = await seedNppCorporations(
        db,
        plan.preset,
        getStartingYearForPreset(plan.preset),
        log
      );
      log(`Economy reset: ${result.totalSpawned} NPP corporations`);
      return {};
    }
    case "reseedNpcBanks": {
      const { seedNpcBanks } = await import("@/lib/admin/seed/seedNpcBanks");
      const result = await seedNpcBanks(db, log);
      log(`Economy reset: ${result.created} NPC banks`);
      return {};
    }
    case "reseedUnions": {
      const { seedUnions } = await import("@/lib/admin/seed/seedUnions");
      // Idempotent upsert, not reset=true: the wipe phase already cleared the
      // union collections, and a resumed apply must keep the same union ids so
      // the representingUnionId pointers written into the rebuilt sectors stay
      // valid.
      await seedUnions(db, log, plan.preset, false);
      return {};
    }
    case "currencyTopology": {
      const { applyEraCurrencyTopology } =
        await import("@/lib/admin/seed/applyEraCurrencyTopology");
      await applyEraCurrencyTopology(db, plan.preset, log);
      return {};
    }
    case "verifyCommandEconomy": {
      const { verifyCommandEconomySeed } =
        await import("@/lib/admin/seed/verifyCommandEconomySeed");
      const report = await verifyCommandEconomySeed(db, plan.preset);
      for (const issue of report.issues) log(`[command-economy] ${issue}`);
      if (report.fatal.length > 0)
        throw new Error(`Command-economy reseed failed for ${report.fatal.join(", ")}`);
      return {};
    }
    case "sovereignBonds": {
      const { seedSovereignBondInstruments } =
        await import("@/lib/admin/seed/seedSovereignBondInstruments");
      const result = await seedSovereignBondInstruments(db, log, plan.currentTurn);
      // Principal is kept with its instruments, so this should find no gap.
      if (result.bondsInserted > 0)
        log(`Economy reset: sovereign bond top-up issued ${result.bondsInserted} tranches`);
      return {};
    }
    case "moneySupply": {
      // Equity pools size from the latest M2, so the cleared economy is measured first.
      const { snapshotMoneySupply } = await import("@/lib/moneySupply/snapshot");
      await snapshotMoneySupply(db, plan.currentTurn);
      return {};
    }
    case "fundMigrations": {
      const result = await runMigrations(db, {
        migrations: MIGRATIONS,
        dryRun: false,
        force: true,
        only: [...ECONOMY_RESET_FUND_MIGRATIONS],
      });
      log(`Economy reset: fund migrations ran ${result.ranIds.length}`);
      return {};
    }
    case "exchangeSnapshot": {
      const { generateStockExchangeSnapshots } = await import("@/lib/turn/stockExchangeSnapshot");
      await generateStockExchangeSnapshots(plan.currentTurn, db);
      return {};
    }
    case "witness":
      return { witnessEntries: await phaseWitness(db, plan, digest, marker.startedAt) };
    case "reseedPrices":
      return phaseReseedPrices(db, plan, log).then(() => ({}));
    case "diagnostic":
      return { diagnosticFailures: await phaseDiagnostic(db, plan, log) };
  }
}

// --- Orchestration ---------------------------------------------------------

export async function applyEconomyReset(
  db: Db,
  options: ApplyEconomyResetOptions
): Promise<ApplyEconomyResetResult> {
  const log = options.log ?? (() => {});
  const digest = options.approvedDigest;
  const state = await gameState(db).findOne({ _id: "current" });
  if (!state || state.worldEpochId !== options.expectedWorldEpoch)
    throw new Error("The expected world is not the live world");
  const existing = state.economyReset;
  if (existing && existing.digest !== digest)
    throw new Error("A different economy reset is recorded on this world");
  if (existing?.completedAt)
    return {
      digest,
      noop: true,
      phasesRun: [],
      diagnosticFailures: existing.diagnosticFailures ?? 0,
      witnessEntries: 0,
    };
  if (state.processingTargetTurn != null || state.processingAbandonedAt != null)
    throw new Error("A turn lock is held; finish or clear the turn before the economy reset");

  const acquiredAt = new Date();
  const lock = await gameState(db).updateOne(
    {
      _id: "current",
      worldEpochId: options.expectedWorldEpoch,
      isProcessing: { $ne: true },
      $or: [
        { processingKind: { $exists: false } },
        { processingKind: null },
        ...(existing ? [{ processingKind: ECONOMY_RESET_PROCESSING_KIND }] : []),
      ],
    } as never,
    {
      $set: {
        isActive: false,
        pauseReason: "Economy reset",
        pauseKind: "manual",
        isProcessing: true,
        processingKind: ECONOMY_RESET_PROCESSING_KIND,
        processingStartedAt: acquiredAt,
        processingHeartbeatAt: acquiredAt,
        corporationActionsPaused: true,
        playerTransfersPaused: true,
        ...(state.isActive === true ? { pausedAt: acquiredAt } : {}),
      },
    }
  );
  if (!lock.matchedCount)
    throw new Error("Finish the active turn or maintenance before applying the economy reset");
  const timer = setInterval(() => {
    void gameState(db)
      .updateOne(
        {
          _id: "current",
          processingKind: ECONOMY_RESET_PROCESSING_KIND,
          processingStartedAt: acquiredAt,
        },
        { $set: { processingHeartbeatAt: new Date() } }
      )
      .catch(() => undefined);
  }, options.heartbeatMs ?? 30_000);

  let completed = false;
  const releaseLock = async (keepIntent: boolean, restoreActive: boolean) =>
    gameState(db).updateOne(
      {
        _id: "current",
        processingKind: ECONOMY_RESET_PROCESSING_KIND,
        processingStartedAt: acquiredAt,
      },
      {
        $set: {
          isProcessing: false,
          // A half-applied reset keeps maintenance intent: turns and player
          // writes stay blocked until a retry finishes.
          processingKind: keepIntent ? ECONOMY_RESET_PROCESSING_KIND : null,
          processingStartedAt: null,
          processingHeartbeatAt: null,
          ...(restoreActive
            ? {
                isActive: state.isActive === true,
                corporationActionsPaused: state.corporationActionsPaused === true,
                playerTransfersPaused: state.playerTransfersPaused === true,
                ...(state.isActive === true
                  ? { pausedAt: null, pauseReason: null, pauseKind: null }
                  : {}),
              }
            : {}),
        },
      }
    );

  let marker: EconomyResetMarker;
  let plan: EconomyResetPlan;
  try {
    if (existing) {
      marker = existing;
      plan = await loadEconomyResetPlan(db, digest);
    } else {
      const census = await captureEconomyResetPlan(db, {
        expectedWorldEpoch: options.expectedWorldEpoch,
        approvalReference: options.approvalReference,
        lock: "own",
      });
      if (census.planDigest !== digest)
        throw new Error(
          `The live plan (${census.planDigest}) differs from the reviewed census (${digest}); re-run the census`
        );
      if (census.plan.blockers.length > 0)
        throw new Error(`Economy reset has blockers: ${census.plan.blockers.join(", ")}`);
      plan = census.plan;
      const chunks = await storeEconomyResetPlan(db, digest, plan, acquiredAt);
      log(`Economy reset: stored the approved plan in ${chunks} chunk(s)`);
      marker = {
        digest,
        approvalReference: options.approvalReference,
        phasesDone: [],
        startedAt: acquiredAt,
        restore: {
          corporationActionsPaused: state.corporationActionsPaused === true,
          playerTransfersPaused: state.playerTransfersPaused === true,
        },
      };
      await gameState(db).updateOne({ _id: "current" }, { $set: { economyReset: marker } });
    }
  } catch (error) {
    clearInterval(timer);
    // Nothing was changed yet: hand the world back exactly as it was.
    await releaseLock(Boolean(existing), !existing);
    throw error;
  }

  const phasesRun: EconomyResetPhase[] = [];
  let witnessEntries = 0;
  let diagnosticFailures = 0;
  try {
    for (const phase of ECONOMY_RESET_PHASES) {
      if (marker.phasesDone.includes(phase)) continue;
      log(`Economy reset phase: ${phase}`);
      const phaseStarted = Date.now();
      const result = await runPhase(db, phase, plan, digest, marker, log);
      witnessEntries += result.witnessEntries ?? 0;
      if (result.diagnosticFailures !== undefined) diagnosticFailures = result.diagnosticFailures;
      await gameState(db).updateOne({ _id: "current" }, {
        $addToSet: { "economyReset.phasesDone": phase },
        ...(result.diagnosticFailures !== undefined
          ? { $set: { "economyReset.diagnosticFailures": result.diagnosticFailures } }
          : {}),
      } as never);
      log(
        `Economy reset phase: ${phase} done in ${((Date.now() - phaseStarted) / 1000).toFixed(1)}s`
      );
      marker.phasesDone.push(phase);
      phasesRun.push(phase);
    }
    const completedAt = new Date();
    await db.collection("adminLogs").updateOne(
      { _id: economyResetObjectId(digest, "adminLog") },
      {
        $setOnInsert: {
          category: "system",
          action: "economy_reset",
          username: "system",
          details: `Economy-only reset ${digest} (${options.approvalReference})`,
          // Bounded by currencies and collections, never by world size; the
          // full plan lives in its chunks under economyResetPlans.
          economyReset: {
            digest,
            worldEpochId: plan.worldEpochId,
            turn: plan.currentTurn,
            preset: plan.preset,
            wipe: plan.wipe,
            money: plan.money,
            centralBanks: plan.centralBanks,
            diagnosticFailures,
          },
          createdAt: completedAt,
        },
      },
      { upsert: true }
    );
    await gameState(db).updateOne(
      {
        _id: "current",
        processingKind: ECONOMY_RESET_PROCESSING_KIND,
        processingStartedAt: acquiredAt,
      },
      {
        $set: {
          "economyReset.completedAt": completedAt,
          corporationActionsPaused: marker.restore.corporationActionsPaused,
          playerTransfersPaused: marker.restore.playerTransfersPaused,
          isActive: false,
          pauseReason: "Economy reset complete; review before resuming turns",
        },
      }
    );
    completed = true;
    return { digest, noop: false, phasesRun, diagnosticFailures, witnessEntries };
  } finally {
    clearInterval(timer);
    await releaseLock(!completed, false);
  }
}
