import {
  rejectConstructionFinance,
  requestConstructionFinance,
} from "@/lib/banking/constructionFinance";
import { cancelFinancedConstruction } from "@/lib/banking/constructionCancellation";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { currencyForCountry } from "@/lib/currency/sectorFxSpread";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { NextResponse } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireCorporationActionsEnabled } from "@/lib/api/requireCorporationActions";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import type {
  Character,
  Corporation,
  CorporateSector,
  GameState,
  GameConfig,
  SectorBuildOrder,
  State,
  StateMetrics,
  UnownedSector,
} from "@/lib/db/types";
import { unownedPoolCredit, unownedPoolDrawdown } from "@/lib/market/unownedPoolDraw";
import { getSectorTechEffects } from "@/lib/constants/techTree";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import { isSectorTechTreesEnabled } from "@/lib/corporations/techTree/featureFlag";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { safeDistributeConversionSpread } from "@/lib/currency/marketMaker";
import { corpToSectorCountrySpread } from "@/lib/currency/sectorFxSpread";
import { insufficientCapitalMessage } from "@/lib/currency/insufficientCapitalMessage";
import {
  fetchCorporationNationalSectorSharePercent,
  fetchSectorCompetitorCount,
  fetchSectorMarketSharePercent,
} from "@/lib/corporations/marketShare";
import {
  queueUndeliveredCost,
  undeliveredCost,
  undeliveredUnits,
} from "@/lib/corporations/buildDelivery";
import {
  commodityDominanceFor,
  loadCommodityDominanceContext,
} from "@/lib/corporations/commodityDominanceContext";
import { resolveCountryPrimeRate } from "@/lib/corporations/sectorGrowthCost";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { logEconomicAction } from "@/lib/corporations/economicActionLog";
import { emitBuildCapexTx } from "@/lib/corporations/capexTxLog";
import { recordCapacityDecisionBestEffort } from "@/lib/corporations/capacityDecisionTelemetry/persistence";
import { classifyCorporationManagement } from "@/lib/corporations/balanceAudit/rules";
import { getMarketSystemMode, isMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { loadStrengthUpkeepStage, upkeptDominanceShield } from "@/lib/corporations/strengthUpkeep";
import {
  CAPACITY_BUILD_CANCEL_REFUND,
  CAPACITY_BUILD_TURNS,
  techBuildTurns,
  MAX_BUILD_UNITS_PER_ORDER,
  computeBuildCost,
} from "@/lib/constants/capacityEconomy";
import {
  dominanceDensityFactor,
  getDominanceGrowthCostMultiplier,
  getNationalDominanceGrowthCostMultiplier,
} from "@/lib/constants/corporations";
import {
  retailCapacityExpansionPaused,
  retailDemandTransitionTurnsRemaining,
} from "@/lib/market/retailDemandTransition";

/**
 * Sector capacity commands (plants tier, P3a of the buildable-sectors plan).
 *
 * Under `marketSystemMode >= "plants"` a sector's `capitalStock` IS its
 * productive capacity and revenue is derived from it, so capacity is the only
 * thing a CEO can buy to grow output. This route is how they buy it:
 *
 *   build      — pay now, capacity arrives CAPACITY_BUILD_TURNS(type) turns later
 *   cancel     — drop an outstanding order, refund CAPACITY_BUILD_CANCEL_REFUND
 *   mothball   — cold-stow the plants: no output, upkeep only
 *   reactivate — bring them back (free, no cooldown in v1)
 *
 * Every action is plants-gated: below that tier capacity is still a haircut on
 * a revenue nameplate that the growth slider drives, and a build order would
 * have nothing coherent to do.
 *
 * Conventions follow `expandSector` / `setSectorGrowth` exactly: basic auth →
 * rate limit → body parse → corp-actions gate → resolve corp → CEO check →
 * work → audit-spine entry via `logEconomicAction`.
 */

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

/**
 * Body schema is local to this command rather than in
 * `lib/api/schemas/corporations.ts`: that file is shared with concurrently
 * developed commands this phase, and there is nothing here another route reads.
 */
const buildCapacitySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("build"),
    /**
     * Capacity units (output units/day) to order. INTEGER and at least 1: a
     * fractional `units` costs effectively nothing (`computeBuildCost` has no
     * floor), so `units: 1e-9` would append a free queue entry — 20/min, for
     * ever, against one unbounded array on one document. It also persists as an
     * order every user-facing string then renders as "0 units".
     */
    units: z.number().int().min(1).max(MAX_BUILD_UNITS_PER_ORDER),
    /** Price-only: compute and return the cost without charging or queueing. */
    preview: z.boolean().optional(),
    financing: z
      .object({
        bankId: z.string().regex(/^[0-9a-fA-F]{24}$/),
        requestId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
        principal: z.number().finite().positive(),
        termTurns: z.number().int().min(4).max(120),
        maximumCostLocal: z.number().finite().positive(),
        maximumRatePercent: z.number().finite().min(0).max(100),
        pledgeConsent: z.literal(true),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    /** Index into the sector's outstanding `buildQueue`. */
    orderIndex: z.number().int().min(0).max(1000),
    constructionClaimId: z.string().min(1).max(120).optional(),
  }),
  z.object({ action: z.literal("withdraw_financing"), claimId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("resize"), activePercent: z.number().int().min(1).max(100) }),
  z.object({ action: z.literal("mothball") }),
  z.object({ action: z.literal("reactivate") }),
]);

/**
 * Most outstanding build orders one sector may hold. `buildQueue` lives inline
 * on the sector document and is rewritten whole by this command, so an
 * unbounded queue is a document-growth DoS, not just untidy. Well above any
 * legitimate play pattern.
 */
const MAX_OUTSTANDING_BUILD_ORDERS = 20;

/**
 * Compare-and-swap guard for the inline `buildQueue`.
 *
 * This command writes the queue with a whole-array `$set` from a snapshot.
 * Without a precondition on the write, two lost updates are live: two
 * concurrent cancels of the same index both refund (money printed), and two
 * concurrent builds drop one order while charging for both. Matching the exact
 * array we read makes both of those writes fail instead of clobbering, and
 * `modifiedCount` tells us which happened.
 *
 * C4: a command racing the turn is guarded by comparing the exact queue it read.
 * The turn pulls delivered orders and is the only writer of stored CIP.
 *
 * The CAS is still exactly right for the command-vs-command races, and it is
 * also what makes a command that overlaps a landing turn fail SAFELY: the pull
 * changes the array, this filter matches nothing, and the caller gets a 409
 * with the money handed back rather than a silent loss.
 *
 * `mothball` / `reactivate` need no CAS: they touch a single scalar
 * (`mothballed`) that the turn only reads, never writes.
 */
function capacityMutationFilter(sector: CorporateSector): Record<string, unknown> {
  return {
    corporationId: sector.corporationId,
    forSale: null,
    constructionPropertyTransition: { $exists: false },
    "constructionFinancing.status": { $nin: ["awaiting_approval", "funding"] },
  };
}

function queueCasFilter(sector: CorporateSector): Record<string, unknown> {
  return {
    ...capacityMutationFilter(sector),
    ...(Array.isArray(sector.buildQueue)
      ? { buildQueue: sector.buildQueue }
      : { buildQueue: { $in: [null, []] } }),
  };
}

/**
 * The sector's CIP total: paid cost still UNDER construction as of `currentTurn`.
 * For a smooth order this falls as capacity is delivered. The command uses this
 * for its response; sectorTurn is the only writer of the stored field.
 */
function cipTotal(queue: SectorBuildOrder[], currentTurn: number): number {
  return queueUndeliveredCost(queue, currentTurn);
}

/**
 * POST /api/corporations/[id]/sectors/[sectorId]/build
 * Capacity build / cancel / mothball / reactivate. CEO only, plants tier only.
 */
export async function buildCapacity(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    // Own bucket at the money-moving siblings' rate (buyListedSector 10/min,
    // abandonSector 10/min) rather than the shared 20/min read-ish default: a
    // build spends unbounded capital and rewrites a shared inline array.
    const rateLimit = checkRateLimit(`sector-build:${auth.user.userId}`, 10, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id, sectorId } = await params;
    const parsed = await parseJsonBody(request, buildCapacitySchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const body = parsed.data;

    const db = await getDb();
    const corpGuard = await requireCorporationActionsEnabled(db);
    if (corpGuard) return corpGuard;

    // Plants gate. Same read shape as setSectorPricing's clearing gate.
    const mode = await getMarketSystemMode();
    if (!isMarketSystemMode(mode) || !marketAtLeast(mode, "plants")) {
      return errorResponse(400, "Capacity building is not enabled in this world");
    }

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;

    if (corporation.ceoType === "npp" && body.action === "build") {
      return errorResponse(
        403,
        "Resume player control before building capacity for this corporation"
      );
    }

    if (!ObjectId.isValid(sectorId)) {
      return errorResponse(400, "Invalid sector ID");
    }
    const sector = await db.collection<CorporateSector>("corporateSectors").findOne({
      _id: new ObjectId(sectorId),
      corporationId: corporation._id,
    });
    if (!sector) {
      return errorResponse(404, "Sector not found");
    }

    if (body.action === "withdraw_financing") {
      const claim = sector.constructionFinancing;
      if (
        !claim ||
        claim.claimId !== body.claimId ||
        claim.borrowerId !== corporation._id.toHexString() ||
        !ObjectId.isValid(claim.bankId) ||
        !ObjectId.isValid(claim.loanId)
      )
        return errorResponse(409, "That construction request changed");
      const result = await rejectConstructionFinance(
        db,
        new ObjectId(claim.bankId),
        new ObjectId(claim.loanId),
        true,
        "Borrower withdrew the construction request"
      );
      return result.ok
        ? NextResponse.json({ success: true, message: "Unfunded construction request withdrawn" })
        : errorResponse(409, result.error);
    }

    // ─── place a build order ─────────────────────────────────────────────────
    // The whole build path lives in `placeCapacityBuild` so the bulk command
    // runs every rule, price and audit leg below unchanged, one sector at a time.
    if (body.action === "build") {
      return capacityBuildResponse(
        await placeCapacityBuild(db, {
          corporation,
          sector,
          userId: auth.user.userId,
          units: body.units,
          preview: body.preview,
          financing: body.financing,
        })
      );
    }

    const ctx = await loadCapacityContext(db, corporation, sector);
    const { currentTurn, countryId, queue, now, corpCurrencyCode, eraUnitScale, poolBucket } = ctx;

    const blocked = capacityChangeBlock(sector, false);
    if (blocked) return errorResponse(blocked.status, blocked.error);

    // ─── mothball / reactivate / resize ──────────────────────────────────────
    // Capacity settings are command-owned. The turn reads them but never
    // writes them back, so a concurrent turn cannot undo a player's choice.
    if (body.action === "mothball" || body.action === "reactivate" || body.action === "resize") {
      const mothballed = body.action === "mothball";
      const activeCapacityPercent = body.action === "resize" ? body.activePercent : 100;
      if (
        (sector.mothballed === true) === mothballed &&
        (sector.activeCapacityPercent ?? 100) === activeCapacityPercent
      ) {
        return errorResponse(400, "Sector already has these capacity settings.");
      }
      const changed = await db
        .collection<CorporateSector>("corporateSectors")
        .updateOne(
          { _id: sector._id, ...capacityMutationFilter(sector) },
          { $set: { mothballed, activeCapacityPercent, updatedAt: now } }
        );
      if (changed.matchedCount === 0) {
        return errorResponse(409, "Sector ownership or listing changed. Refresh and try again.");
      }
      void logEconomicAction(db, {
        characterId: corporation.ceoId,
        userId: auth.user.userId,
        actionType:
          body.action === "resize"
            ? "resizeSectorCapacity"
            : mothballed
              ? "mothballSector"
              : "reactivateSector",
        targetState: sector.stateId,
        turn: currentTurn,
        characterName: corporation.name,
        countryId,
        result: {
          success: true,
          message: `${sector.sectorType} in ${sector.stateId}: ${mothballed ? 0 : activeCapacityPercent}% capacity active`,
        },
      }).catch(() => {});
      return NextResponse.json({
        success: true,
        mothballed,
        activeCapacityPercent,
        message:
          "Capacity settings saved. Production and upkeep adjust next turn. Owned plants and construction orders are unchanged.",
      });
    }

    // ─── cancel an outstanding order ─────────────────────────────────────────
    if (body.action === "cancel") {
      const order = queue[body.orderIndex];
      const claim = sector.constructionFinancing;
      if (body.constructionClaimId || order?.constructionLoanId) {
        if (
          !claim ||
          (body.constructionClaimId && claim.claimId !== body.constructionClaimId) ||
          (order?.constructionLoanId && order.constructionLoanId !== claim.loanId)
        )
          return errorResponse(409, "That financed build claim changed");
        // A persisted pledge remains recoverable if admission of new finance is disabled.
        const cancelled = await cancelFinancedConstruction({
          db,
          enabled: true,
          sectorId: sector._id,
          borrowerId: corporation._id,
          turn: currentTurn,
        });
        return cancelled.ok
          ? NextResponse.json({ success: true, ...cancelled })
          : errorResponse(409, cancelled.error);
      }
      if (!order) {
        return errorResponse(404, "No such build order");
      }
      if (order.onlineTurn <= currentTurn) {
        return errorResponse(400, "That build has already been delivered");
      }
      const nextQueue = queue.filter((_, i) => i !== body.orderIndex);
      // Refund only the part still UNDER construction. A smooth order has
      // already delivered some capacity (it is in `capitalStock` and the CEO
      // keeps it); refunding the full order would hand back cash for plants they
      // already own. `undeliveredCost` is the whole order for a legacy build and
      // the not-yet-built remainder for a smooth one.
      const refundAnchor = undeliveredCost(order, currentTurn) * CAPACITY_BUILD_CANCEL_REFUND;
      // Units actually cancelled — the not-yet-built remainder. Already-delivered
      // capacity stays in `capitalStock`; only this is undone.
      const cancelledUnits = undeliveredUnits(order, currentTurn);
      const corpFxRate = await getCorpFxRate(db, corporation);
      const refundInCorpCapital = Math.round(
        anchorToCorpLiquidCapital(refundAnchor, corporation, corpFxRate)
      );

      // CAS: the refund below is only paid if THIS request is the one that
      // actually removed the order. A replayed or concurrent cancel of the same
      // index matches nothing and refunds nothing.
      const cancelWrite = await db.collection<CorporateSector>("corporateSectors").updateOne(
        { _id: sector._id, ...queueCasFilter(sector) },
        {
          $set: {
            buildQueue: nextQueue,
            updatedAt: now,
          },
        }
      );
      if (cancelWrite.modifiedCount !== 1) {
        return errorResponse(409, "That build queue changed while you were cancelling. Try again.");
      }
      if (refundInCorpCapital > 0) {
        await db
          .collection<Corporation>("corporations")
          .updateOne(
            { _id: corporation._id },
            { $inc: { liquidCapital: refundInCorpCapital }, $set: { updatedAt: now } }
          );
      }

      // Return the cancelled units to the unowned pool (#1145). The order-time
      // drawdown consumed the whole order; only the part that never became
      // capacity comes back, because the delivered remainder is still owned and
      // still counts against market share. Same best-effort discipline as the
      // drawdown itself.
      const poolCredit = unownedPoolCredit(poolBucket, cancelledUnits, now, eraUnitScale);
      if (poolCredit) {
        await db
          .collection<UnownedSector>("unownedSectors")
          .updateOne(
            {
              stateId: sector.stateId,
              sectorType: sector.sectorType,
              industryModel: sector.industryModel ?? null,
              mediaDiscriminator: sector.mediaDiscriminator ?? null,
            },
            poolCredit,
            { upsert: true }
          )
          .catch((err) => {
            console.error("[buildCapacity] unowned pool credit failed", err);
          });
      }

      // Shadow-ledger credit leg. Without this the refund is a mint the
      // money-supply reconciler cannot attribute. Post-commit and best-effort:
      // the cash has already moved, so a tx-log failure must not 500 the caller
      // into retrying (which would double-refund) — same discipline as
      // `safeDistributeConversionSpread` and `logEconomicAction` here.
      if (refundAnchor > 0) {
        await emitBuildCapexTx(db, {
          corporationId: corporation._id,
          corporationName: corporation.name,
          corporationSequentialId: corporation.sequentialId,
          direction: "refund",
          amountLocal: Math.abs(refundInCorpCapital),
          currencyCode: corpCurrencyCode,
          anchorAmount: refundAnchor,
          turn: currentTurn,
          createdAt: now,
          sectorId: sector._id,
          sectorType: sector.sectorType,
          units: cancelledUnits,
          meta: { orderStartTurn: order.startTurn, orderOnlineTurn: order.onlineTurn },
        }).catch((err) => {
          console.error("[buildCapacity] capex refund tx emit failed", err);
        });
      }

      void logEconomicAction(db, {
        characterId: corporation.ceoId,
        userId: auth.user.userId,
        actionType: "cancelCapacityBuild",
        targetState: sector.stateId,
        turn: currentTurn,
        characterName: corporation.name,
        countryId,
        // Negative cost == cash returned to the corp.
        corpCashCostAnchor: -refundAnchor,
        currencyCode: resolveCorpLiquidCurrencyCode(corporation),
        result: {
          success: true,
          message: `Cancelled a ${Math.round(cancelledUnits)}-unit build in ${sector.stateId}`,
        },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        refunded: refundInCorpCapital,
        refundFraction: CAPACITY_BUILD_CANCEL_REFUND,
        constructionInProgressAnchor: Math.round(cipTotal(nextQueue, currentTurn)),
      });
    }

    return errorResponse(400, "Unknown capacity action");
  } catch (error) {
    return handleRouteError(error);
  }
}

type BuildCapacityBody = z.infer<typeof buildCapacitySchema>;
/** The optional construction-loan request a single build may carry. */
export type CapacityBuildFinancing = NonNullable<
  Extract<BuildCapacityBody, { action: "build" }>["financing"]
>;

/** Shared per-sector state every capacity action reads before it acts. */
interface CapacityContext {
  gameState: GameState | null;
  currentTurn: number;
  currentYear: number;
  countryId: Corporation["countryId"];
  queue: SectorBuildOrder[];
  now: Date;
  corpCurrencyCode: CurrencyCode;
  eraUnitScale: number;
  poolBucket: {
    stateId: CorporateSector["stateId"];
    countryId: Corporation["countryId"];
    sectorType: CorporateSector["sectorType"];
    industryModel: CorporateSector["industryModel"];
    mediaDiscriminator: CorporateSector["mediaDiscriminator"];
  };
}

async function loadCapacityContext(
  db: Db,
  corporation: Corporation,
  sector: CorporateSector
): Promise<CapacityContext> {
  const gameState = await db.collection<GameState>("gameState").findOne({ _id: "current" });
  const currentTurn = gameState?.currentTurn ?? 0;
  const currentYear =
    gameState?.currentYear ??
    STARTING_YEAR + Math.floor((Math.max(1, currentTurn) - 1) / TURNS_PER_YEAR);

  // `countryId` keys the unowned-capacity pool below, the prime rate the build
  // is financed at and the country stamped on the action log, so it has to be
  // the country the STATE is in, never the country the corporation is
  // domiciled in. The old order fell through to `corporation.countryId` and
  // then to a literal "US", which is how two `unownedSectors` docs came to sit
  // on Ukrainian states under the United States: unreachable to Ukraine, and
  // counted as US capacity by every reader (ticket #1271).
  //
  // The state is read UNCONDITIONALLY and preferred over the sector's stored
  // value, which is the precedence `getSectorOperatingCountryId` sets for the
  // rest of the codebase: a stored `countryId` left stale by a region changing
  // hands is exactly the case that helper exists for, and taking it first
  // would reintroduce the bug in its other form.
  const sectorState = await db
    .collection<State>("states")
    .findOne({ _id: sector.stateId }, { projection: { countryId: 1 } });
  // No guard on the result: `CorporateSector.countryId` and
  // `Corporation.countryId` are both required, so the chain always resolves,
  // and the sibling `setSectorGrowth` carries no guard either.
  const countryId = sectorState?.countryId ?? sector.countryId ?? corporation.countryId;

  return {
    gameState,
    currentTurn,
    currentYear,
    countryId,
    queue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
    now: new Date(),
    // `resolveCorpLiquidCurrencyCode` is optional-typed for null corps; this one
    // is resolved, and the tx log requires a concrete code.
    corpCurrencyCode: resolveCorpLiquidCurrencyCode(corporation) ?? "USD",
    // Shared by build and cancel: the cancel branch returns cancelled units to
    // the unowned pool on the same unit basis the drawdown consumed them on.
    eraUnitScale: getEraUnitScale(resolvePresetIdFromGameState(gameState)),
    poolBucket: {
      stateId: sector.stateId,
      countryId,
      sectorType: sector.sectorType,
      industryModel: sector.industryModel,
      mediaDiscriminator: sector.mediaDiscriminator,
    },
  };
}

/**
 * Sector states no capacity change may touch. A financed build is the one
 * action allowed past a reserved construction request, because it is the
 * request being completed.
 */
function capacityChangeBlock(
  sector: CorporateSector,
  financedBuild: boolean
): { status: number; error: string } | null {
  // No blanket state-owned block here: the appointed CEO of a National
  // Corporation legitimately builds, mothballs and manages its capacity
  // (ticket #1072). `requireCeo` already proved the caller holds THIS corp's
  // CEO seat, and the sector was fetched constrained to
  // `corporationId: corporation._id`, so a sector nationalized AWAY from a
  // former-private CEO no longer matches and cannot reach this handler.
  if (
    sector.constructionPropertyTransition ||
    ((sector.constructionFinancing?.status === "awaiting_approval" ||
      sector.constructionFinancing?.status === "funding") &&
      !financedBuild)
  )
    return {
      status: 409,
      error: "Finish or withdraw the reserved construction request before changing capacity",
    };
  // A sector under offer must not have its capacity gutted mid-sale: CIP and
  // the build queue feed the valuation a buyer is quoted, and cancelling every
  // order refunds 75% to the seller while delivering a hollowed-out asset.
  if (sector.forSale != null)
    return { status: 400, error: "Unlist this sector before changing its capacity." };
  return null;
}

/** Why a build was refused, so a caller running many builds can react to it. */
export type CapacityBuildFailure =
  "blocked" | "queue_full" | "insufficient_cash" | "concurrent_change" | "finance";

export type CapacityBuildOutcome =
  | {
      ok: true;
      status: number;
      /** Exactly the JSON the single-sector route returns. */
      body: Record<string, unknown>;
      /** Cash debited in the corporation's own currency (0 for previews and financed builds). */
      chargedLocal: number;
      /** The sector already holds the most outstanding orders a build may join. */
      queueFull: boolean;
    }
  | { ok: false; status: number; code: CapacityBuildFailure; error: string };

function fail(status: number, code: CapacityBuildFailure, error: string): CapacityBuildOutcome {
  return { ok: false, status, code, error };
}

function capacityBuildResponse(outcome: CapacityBuildOutcome) {
  return outcome.ok
    ? NextResponse.json(outcome.body, { status: outcome.status })
    : errorResponse(outcome.status, outcome.error);
}

export interface PlaceCapacityBuildInput {
  /** The resolved corporation. The caller has already proven the user is its CEO. */
  corporation: Corporation;
  /** A sector already fetched constrained to `corporationId: corporation._id`. */
  sector: CorporateSector;
  userId: string;
  units: number;
  preview?: boolean;
  financing?: CapacityBuildFinancing;
}

/**
 * Price, and unless `preview`, place one capacity build order on one sector.
 *
 * This is the single-sector build path, lifted out of the route so the bulk
 * command can run it once per sector with every rule, price, charge, pool
 * drawdown, ledger leg and audit entry unchanged. Callers own auth, rate
 * limiting, the corp-actions gate, the plants gate and the CEO check.
 */
export async function placeCapacityBuild(
  db: Db,
  input: PlaceCapacityBuildInput
): Promise<CapacityBuildOutcome> {
  const { corporation, sector } = input;
  if (corporation.ceoType === "npp")
    return fail(
      403,
      "blocked",
      "Resume player control before building capacity for this corporation"
    );

  const {
    gameState,
    currentTurn,
    currentYear,
    countryId,
    queue,
    now,
    corpCurrencyCode,
    eraUnitScale,
    poolBucket,
  } = await loadCapacityContext(db, corporation, sector);

  if (sector.sectorType === "retail") {
    const transition = await db.collection<GameConfig>("gameConfig").findOne(
      { _id: "default" },
      {
        projection: {
          retailDemandTransitionStartTurn: 1,
          retailDemandTransitionTurns: 1,
        },
      }
    );
    if (retailCapacityExpansionPaused(transition, currentTurn)) {
      const remaining = retailDemandTransitionTurnsRemaining(transition, currentTurn);
      return fail(
        409,
        "blocked",
        `New Retail capacity is paused while consumer demand is rebalanced (${remaining} turns remaining). Existing stores may still operate, mothball, or cancel builds.`
      );
    }
  }

  const blocked = capacityChangeBlock(sector, !!input.financing);
  if (blocked) return fail(blocked.status, "blocked", blocked.error);

  const succeed = (
    status: number,
    body: Record<string, unknown>,
    chargedLocal = 0
  ): CapacityBuildOutcome => ({
    ok: true,
    status,
    body,
    chargedLocal,
    queueFull: queue.length >= MAX_OUTSTANDING_BUILD_ORDERS,
  });

  const { units, preview } = input;
  const primeRate = await resolveCountryPrimeRate(db, countryId);
  // Dominance multiplier: fetched the same way setSectorGrowth does, so a
  // dominant sector pays the same premium to build as it does to grow.
  const [marketSharePct, nationalMarketSharePct, competitorCount] = await Promise.all([
    fetchSectorMarketSharePercent(db, sector, corporation),
    fetchCorporationNationalSectorSharePercent(db, {
      corporationId: corporation._id,
      countryId,
      sectorType: sector.sectorType,
      industryModel: sector.industryModel,
    }),
    fetchSectorCompetitorCount(db, sector, corporation._id),
  ]);
  // How contested the cell is, which scales that dominance toll. Resolved
  // here AND in the sector-detail quote from the same helper, so the price the
  // dialog shows is the price this command charges.
  const ceoChar = corporation.ceoId
    ? await db
        .collection<Character>("characters")
        .findOne({ _id: corporation.ceoId }, { projection: { "stats.businessAcumen": 1 } })
    : null;
  const ceoAcumen = ceoChar?.stats?.businessAcumen ?? NEUTRAL_STAT;
  // Host price level: the sector's OWN state's cost-of-living index, so where
  // you build changes what it costs. Absent metrics ⇒ neutral 1.0 (see
  // `hostBuildPriceIndex`).
  const hostMetrics = await db
    .collection<StateMetrics>("macroMetrics")
    .findOne({ _id: sector.stateId }, { projection: { "economic.costOfLiving": 1 } });
  const hostCostOfLivingIndex = hostMetrics?.economic?.costOfLiving?.value ?? null;
  // Tech-tree growth-cost reduction, re-homed onto the build price (it bought
  // nothing under plants, where the growth slider is vestigial). Scoped to the
  // corp's primary type exactly as `expandSector` scopes its own discount.
  const techView = {
    type: corporation.type,
    industryModel: corporation.industryModel,
    mediaDiscriminator: corporation.mediaDiscriminator,
    unlockedTechNodeIds: corporation.unlockedTechNodeIds,
    techDecadeLane: corporation.techDecadeLane,
  };
  const techBuildEffects = (await isSectorTechTreesEnabled())
    ? getSectorTechEffects(
        techView,
        sector.sectorType,
        sector.industryModel,
        sector.mediaDiscriminator
      )
    : null;
  const techBuildCostMultiplier = techBuildEffects?.growthCostMultiplier ?? 1;
  // Strength upkeep: from its shield stage the dominance shield counts only
  // current and previous decade techs and is capped at 50%.
  const techDominanceShield = techBuildEffects
    ? upkeptDominanceShield(
        techView,
        sector.sectorType,
        sector.industryModel,
        sector.mediaDiscriminator,
        currentYear,
        await loadStrengthUpkeepStage(db)
      )
    : 0;

  // Commodity-level toll: what this firm could make of each commodity the
  // sector produces (owned plus queued plus THIS order) over world demand.
  const commodityDominanceCtx = await loadCommodityDominanceContext(db, {
    corporation,
    sector,
    turn: currentTurn,
    currentYear,
  });
  const commodityDominance = commodityDominanceCtx
    ? commodityDominanceFor(commodityDominanceCtx, units)
    : null;

  const cost = computeBuildCost({
    sectorType: sector.sectorType,
    industryModel: sector.industryModel,
    mediaDiscriminator: sector.mediaDiscriminator,
    units,
    // Capacity is priced at the product this sector actually makes. Ordering
    // into a sector already running a high-RPU strategy used to be charged
    // the sector-type default price, which is the 326.9x rare-earth subsidy.
    strategyId: sector.strategyId ?? null,
    year: currentYear,
    preset: resolvePresetIdFromGameState(gameState),
    eraUnitScale,
    marketSharePercent: marketSharePct,
    nationalMarketSharePercent: nationalMarketSharePct,
    competitorCount: competitorCount ?? undefined,
    commodityDominanceRatio: commodityDominance?.ratio ?? 0,
    primeRate,
    acumen: ceoAcumen,
    hostCostOfLivingIndex,
    techGrowthCostMultiplier: techBuildCostMultiplier,
    techDominanceShield,
  });
  // The same research that discounts the price also shortens the build.
  const buildTurns = techBuildTurns(
    CAPACITY_BUILD_TURNS(sector.sectorType),
    techBuildCostMultiplier
  );
  const corpFxRate = await getCorpFxRate(db, corporation);
  const spread = corpToSectorCountrySpread(corporation, countryId, cost.totalAnchor);
  const totalCostAnchor = cost.totalAnchor + spread.spreadAnchor;
  const corpCapitalAnchor = corpLiquidCapitalToAnchor(
    corporation.liquidCapital,
    corporation,
    corpFxRate
  );
  // Management cohort (never an id) so the balance funnel can split player
  // and NPP capacity decisions without identifying anyone.
  const cohort = classifyCorporationManagement({
    ceoType: corporation.ceoType ?? null,
    ceoVacant: corporation.ceoVacant,
    countryOwnerId: corporation.countryOwnerId ?? null,
    ownershipState: corporation.ownershipState ?? null,
    userId: corporation.userId?.toString() ?? null,
  });
  const observe = (
    stage: "quote" | "order",
    outcome: "quoted" | "placed" | "queue_full" | "insufficient_cash" | "concurrent_change"
  ) =>
    recordCapacityDecisionBestEffort(db, currentTurn, {
      actor: "player",
      cohort,
      stage,
      outcome,
      marketSharePct,
      competitorCount: competitorCount ?? 0,
      rawDominanceMultiplier: Math.max(
        getDominanceGrowthCostMultiplier(marketSharePct),
        getNationalDominanceGrowthCostMultiplier(nationalMarketSharePct)
      ),
      dominanceDensityFactor: dominanceDensityFactor(competitorCount),
      dominanceMultiplier: cost.dominanceMultiplier,
      unitPriceAnchor: cost.unitPriceAnchor,
      cashHeadroomAnchor: corpCapitalAnchor - totalCostAnchor,
      requestedUnits: units,
    });

  if (preview) {
    void observe("quote", "quoted");
    return succeed(200, {
      success: true,
      preview: true,
      units,
      costAnchor: Math.round(cost.totalAnchor),
      totalCostLocal: anchorToCorpLiquidCapital(totalCostAnchor, corporation, corpFxRate),
      collateralCostLocal: anchorToCorpLiquidCapital(cost.totalAnchor, corporation, corpFxRate),
      currency: corpCurrencyCode,
      unitPriceAnchor: Math.round(cost.unitPriceAnchor * 100) / 100,
      dominanceMultiplier: Math.round(cost.dominanceMultiplier * 1000) / 1000,
      commodityDominanceMultiplier: Math.round(cost.commodityDominanceMultiplier * 1000) / 1000,
      commodityDominanceRatio: Math.round((commodityDominance?.ratio ?? 0) * 1000) / 1000,
      rateMultiplier: Math.round(cost.rateMultiplier * 1000) / 1000,
      acumenMultiplier: Math.round(cost.acumenMultiplier * 1000) / 1000,
      techMultiplier: Math.round(cost.techMultiplier * 1000) / 1000,
      hostPriceMultiplier: Math.round(cost.hostPriceMultiplier * 1000) / 1000,
      buildTurns,
      onlineTurn: currentTurn + buildTurns,
    });
  }

  const order: SectorBuildOrder = {
    unitsOrdered: units,
    // Freeze the strategy this order was priced at. `cost` above was computed
    // from the same value, so the two can never drift apart.
    strategyId: sector.strategyId ?? null,
    // The FX spread is a transaction fee, not construction spend: it is not
    // refundable capital, so it stays out of the order's paid cost (and out
    // of CIP and the cancellation refund base).
    costPaidAnchor: cost.totalAnchor,
    startTurn: currentTurn,
    onlineTurn: currentTurn + buildTurns,
    // Deliver the capacity a slice per turn across the build window rather than
    // as one lump on `onlineTurn`. See `buildDelivery.ts`. Only orders placed
    // through this path ramp; legacy in-flight orders keep all-at-once landing.
    smooth: true,
  };
  if (input.financing) {
    const policy = await loadBankingPolicy(db);
    if (!policy.constructionFinance)
      return fail(400, "finance", "Construction finance is not enabled");
    const finance = await requestConstructionFinance({
      db,
      enabled: true,
      sector,
      corporation,
      bankId: new ObjectId(input.financing.bankId),
      requestId: input.financing.requestId,
      principal: input.financing.principal,
      termTurns: input.financing.termTurns,
      maximumCostLocal: input.financing.maximumCostLocal,
      maximumRatePercent: input.financing.maximumRatePercent,
      constructionCostLocal: anchorToCorpLiquidCapital(totalCostAnchor, corporation, corpFxRate),
      collateralCostLocal: anchorToCorpLiquidCapital(cost.totalAnchor, corporation, corpFxRate),
      order,
      buildContext: {
        destinationCurrency: currencyForCountry(countryId),
        bucket: poolBucket,
        eraUnitScale,
        growthUnits: units,
      },
    });
    if (!finance.ok) return fail(409, "finance", finance.error);
    void observe("order", "placed");
    return succeed(200, {
      success: true,
      financed: true,
      ...finance,
      message: finance.pending
        ? "Construction is awaiting the lender's approval. Capacity will be queued after cash is funded."
        : "Construction funded and queued. The sector remains pledged until secured principal is paid.",
    });
  }

  if (queue.length >= MAX_OUTSTANDING_BUILD_ORDERS) {
    void observe("order", "queue_full");
    return fail(
      400,
      "queue_full",
      `This sector already has ${MAX_OUTSTANDING_BUILD_ORDERS} builds under way. Wait for one to finish or cancel it.`
    );
  }

  // Cross-currency friction, mirroring expandSector: a corp building in a
  // different-currency country pays the reduced sector FX spread on top.
  if (corpCapitalAnchor < totalCostAnchor) {
    void observe("order", "insufficient_cash");
    return fail(
      400,
      "insufficient_cash",
      insufficientCapitalMessage(
        "This build",
        anchorToCorpLiquidCapital(totalCostAnchor, corporation, corpFxRate),
        corporation.liquidCapital,
        resolveCorpLiquidCurrencyCode(corporation)
      )
    );
  }

  const nextQueue = [...queue, order];

  // Charge FIRST, with the balance condition IN THE FILTER. The JS check
  // above races: two concurrent builds both read the same starting balance,
  // both pass, and both $inc down through zero. `$gte` makes the loser's
  // write match nothing.
  const costInCorpCapital = anchorToCorpLiquidCapital(totalCostAnchor, corporation, corpFxRate);
  const debit = await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: corporation._id, liquidCapital: { $gte: costInCorpCapital } },
      { $inc: { liquidCapital: -costInCorpCapital }, $set: { updatedAt: now } }
    );
  if (debit.modifiedCount !== 1) {
    void observe("order", "insufficient_cash");
    return fail(
      400,
      "insufficient_cash",
      insufficientCapitalMessage(
        "This build",
        anchorToCorpLiquidCapital(totalCostAnchor, corporation, corpFxRate),
        corporation.liquidCapital,
        resolveCorpLiquidCurrencyCode(corporation)
      )
    );
  }
  // Then queue the order under the same CAS the cancel path uses. If another
  // writer (a concurrent build/cancel, or the turn processor) touched the
  // queue since we read it, our $set would silently erase their work, so
  // fail instead, and hand the money back rather than charging for an order
  // that was never queued.
  const queueWrite = await db.collection<CorporateSector>("corporateSectors").updateOne(
    { _id: sector._id, ...queueCasFilter(sector) },
    {
      $set: {
        buildQueue: nextQueue,
        updatedAt: now,
      },
    }
  );
  if (queueWrite.modifiedCount !== 1) {
    await db
      .collection<Corporation>("corporations")
      .updateOne(
        { _id: corporation._id },
        { $inc: { liquidCapital: costInCorpCapital }, $set: { updatedAt: now } }
      );
    void observe("order", "concurrent_change");
    return fail(
      409,
      "concurrent_change",
      "That build queue changed while you were ordering. Try again."
    );
  }
  if (spread.spreadAnchor > 0 && spread.from && spread.to) {
    const feeInCorp = Math.round(
      anchorToCorpLiquidCapital(spread.spreadAnchor, corporation, corpFxRate)
    );
    await safeDistributeConversionSpread(db, feeInCorp, spread.from, spread.to);
  }
  void observe("order", "placed");

  // ─── Draw the ordered capacity DOWN from the unowned pool (#1145) ────────
  //
  // Market share under plants is `owned / (owned + headroomUnits)`. Founding
  // already consumed headroom (`expandSector`); building on an EXISTING plant
  // did not, so every post-founding unit counted as owned while leaving the
  // demand backing it in the pool. The pie therefore read "60% unowned" on a
  // market the world had already built out, and the expand gate, which reads
  // a real demand gap, refused to build into it.
  //
  // Drawn at ORDER time, not delivery: it is the CLAIM on the market that
  // consumes headroom, and ordering-time is also what stops two concurrent
  // builders from each buying the same slice. The cancel path returns the
  // undelivered remainder, so the two are symmetric.
  //
  // Post-commit and best-effort, exactly like the capex leg below: the money
  // and the queue write have already landed, and a pool-write failure must
  // not 500 the caller into retrying an order that already exists. Failing
  // here leaves the pre-existing (leaky) behaviour, never a worse one.
  const drawdown = unownedPoolDrawdown(poolBucket, units, now, eraUnitScale);
  if (drawdown) {
    await db
      .collection<UnownedSector>("unownedSectors")
      .updateOne(
        {
          stateId: sector.stateId,
          sectorType: sector.sectorType,
          industryModel: sector.industryModel ?? null,
          mediaDiscriminator: sector.mediaDiscriminator ?? null,
        },
        drawdown,
        { upsert: true }
      )
      .catch((err) => {
        console.error("[buildCapacity] unowned pool drawdown failed", err);
      });
  }

  // Shadow-ledger debit leg: the cash → CIP reclass. Logged at the CIP
  // amount (`cost.totalAnchor`), NOT the charged total: the FX spread is a
  // transaction fee routed to the central banks by
  // `safeDistributeConversionSpread`, not construction spend, and it is
  // deliberately excluded from CIP and from the refund base above. Without
  // this row every build is an unattributed burn in the money-supply
  // reconciler. Best-effort for the same reason as the refund leg.
  if (cost.totalAnchor > 0) {
    await emitBuildCapexTx(db, {
      corporationId: corporation._id,
      corporationName: corporation.name,
      corporationSequentialId: corporation.sequentialId,
      direction: "build",
      amountLocal: Math.abs(anchorToCorpLiquidCapital(cost.totalAnchor, corporation, corpFxRate)),
      currencyCode: corpCurrencyCode,
      anchorAmount: cost.totalAnchor,
      turn: currentTurn,
      createdAt: now,
      sectorId: sector._id,
      sectorType: sector.sectorType,
      units,
      meta: { onlineTurn: order.onlineTurn, spreadAnchor: spread.spreadAnchor },
    }).catch((err) => {
      console.error("[buildCapacity] capex build tx emit failed", err);
    });
  }

  void logEconomicAction(db, {
    characterId: corporation.ceoId,
    userId: input.userId,
    actionType: "buildCapacity",
    targetState: sector.stateId,
    turn: currentTurn,
    characterName: corporation.name,
    countryId,
    corpCashCostAnchor: totalCostAnchor,
    currencyCode: resolveCorpLiquidCurrencyCode(corporation),
    result: {
      success: true,
      message: `Ordered ${Math.round(units)} units of ${sector.sectorType} capacity in ${sector.stateId}`,
      fundsChange: -costInCorpCapital,
    },
  }).catch(() => {});

  return succeed(
    201,
    {
      success: true,
      units,
      costAnchor: Math.round(cost.totalAnchor),
      chargedAnchor: Math.round(totalCostAnchor),
      onlineTurn: order.onlineTurn,
      constructionInProgressAnchor: Math.round(cipTotal(nextQueue, currentTurn)),
      message: `Build ordered. ${Math.round(units)} units come online in ${buildTurns} turns.`,
    },
    costInCorpCapital
  );
}
