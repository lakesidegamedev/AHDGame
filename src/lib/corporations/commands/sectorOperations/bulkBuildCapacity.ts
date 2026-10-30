import { rejectWhileTurnProcessing } from "./turnGuard";
/**
 * Build capacity across many sectors in one request (suggestion 391).
 *
 * Every sector goes through `placeCapacityBuild`, the exact single-sector build
 * path behind POST /api/corporations/[id]/sectors/[sectorId]/build, one sector
 * at a time. Prices, dominance tolls, transfer fees, the cash debit, the
 * unowned-pool drawdown, the capex ledger leg and the economic action log are
 * therefore identical to a CEO clicking Build on each sector in turn. This file
 * only chooses the sectors, sizes each order and stops spending when the cash
 * runs out.
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireCorporationActionsEnabled } from "@/lib/api/requireCorporationActions";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { countryIdSchema } from "@/lib/api/schemas/country";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import { MAX_BUILD_UNITS_PER_ORDER } from "@/lib/constants/capacityEconomy";
import { getMarketSystemMode, isMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  BULK_BUILD_MAX_FACILITIES,
  BULK_BUILD_MAX_SECTORS,
  bulkBuildUnits,
  planBulkBuild,
  selectBulkBuildSectors,
  type BulkBuildQuoteRow,
} from "@/lib/corporations/rules/bulkBuildCapacity";
import { placeCapacityBuild } from "./buildCapacity";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bulkBuildCapacitySchema = z.object({
  /** Omitted or null: every country the corporation operates in. */
  countryId: countryIdSchema.nullable().optional(),
  /** Omitted or null: every sector type. */
  sectorType: z.enum(OPERATING_SECTOR_TYPES).nullable().optional(),
  /** Optional explicit list, still narrowed by the two filters above. */
  sectorIds: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .max(BULK_BUILD_MAX_SECTORS)
    .optional(),
  rule: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("facilities"),
      count: z.number().int().min(1).max(BULK_BUILD_MAX_FACILITIES),
    }),
    z.object({ kind: z.literal("percent"), percent: z.number().int().min(1).max(100) }),
  ]),
  mode: z.enum(["preview", "apply"]),
  /**
   * Apply only: the total the CEO confirmed, in the corporation's currency.
   * Spending stops before any order that would take the run past it, so a
   * price that moved between preview and confirm can never charge more than
   * the confirmed figure.
   */
  maxTotalLocal: z.number().finite().positive().optional(),
});

export type BulkBuildRowResult = {
  sectorId: string;
  stateId: string;
  countryId: string;
  sectorType: string;
  capacityUnits: number;
  units: number;
  costLocal: number;
  /** Fewer workers than the sector wants: new jobs may stay vacant. */
  understaffed: boolean;
  status: "ready" | "over_budget" | "blocked" | "built" | "skipped";
  reason: string | null;
};

const OVER_BUDGET_REASON = "Not enough cash left after the sectors above";

/**
 * POST /api/corporations/[id]/sectors/bulk-build
 * Preview or place capacity builds across up to BULK_BUILD_MAX_SECTORS
 * sectors. CEO only, plants tier only.
 */
export async function bulkBuildCapacity(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;
    const turnBusy = await rejectWhileTurnProcessing();
    if (turnBusy) return turnBusy;

    const parsed = await parseJsonBody(request, bulkBuildCapacitySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const body = parsed.data;
    if (body.mode === "apply" && body.maxTotalLocal === undefined) {
      return errorResponse(400, "Confirm the total before building");
    }

    // Separate buckets: previews follow the filters as the CEO changes them,
    // while an apply runs up to BULK_BUILD_MAX_SECTORS money-moving builds.
    const rateLimit =
      body.mode === "apply"
        ? checkRateLimit(`sector-build-bulk-apply:${auth.user.userId}`, 3, 60000)
        : checkRateLimit(`sector-build-bulk-preview:${auth.user.userId}`, 20, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id } = await params;
    const db = await getDb();
    const corpGuard = await requireCorporationActionsEnabled(db);
    if (corpGuard) return corpGuard;

    const mode = await getMarketSystemMode();
    if (!isMarketSystemMode(mode) || !marketAtLeast(mode, "plants")) {
      return errorResponse(400, "Capacity building is not enabled in this world");
    }

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    let corporation: Corporation = resolved.corporation;

    const ceoCheck = requireCeo(corporation, auth.user.userId);
    if (ceoCheck) return ceoCheck;
    if (corporation.ceoType === "npp") {
      return errorResponse(
        403,
        "Resume player control before building capacity for this corporation"
      );
    }

    const sectorsCol = db.collection<CorporateSector>("corporateSectors");
    const holdings = await sectorsCol
      .find(
        { corporationId: corporation._id },
        { projection: { _id: 1, countryId: 1, sectorType: 1, stateId: 1 } }
      )
      .toArray();
    const selected = selectBulkBuildSectors(
      holdings.map((s) => ({
        sectorId: s._id.toHexString(),
        countryId: String(s.countryId ?? corporation.countryId),
        sectorType: String(s.sectorType),
        stateId: String(s.stateId),
      })),
      { countryId: body.countryId, sectorType: body.sectorType, sectorIds: body.sectorIds }
    );
    if (selected.length === 0) {
      return errorResponse(400, "No sectors match this selection.");
    }
    if (selected.length > BULK_BUILD_MAX_SECTORS) {
      return errorResponse(
        400,
        `This selection has ${selected.length} sectors. Narrow it to ${BULK_BUILD_MAX_SECTORS} or fewer by country or sector type.`
      );
    }

    // Full documents: the build path reads the queue, strategy, listing and
    // financing state of each one.
    const docs = await sectorsCol
      .find({
        _id: { $in: selected.map((s) => new ObjectId(s.sectorId)) },
        corporationId: corporation._id,
      })
      .toArray();
    const byId = new Map(docs.map((d) => [d._id.toHexString(), d]));
    const ordered = selected
      .map((s) => ({ meta: s, sector: byId.get(s.sectorId) }))
      .filter((r): r is { meta: (typeof selected)[number]; sector: CorporateSector } => !!r.sector);

    const currency = resolveCorpLiquidCurrencyCode(corporation) ?? "USD";
    const rows: BulkBuildRowResult[] = ordered.map(({ meta, sector }) => {
      const capacityUnits = sector.operatingCapacityUnits ?? sector.capitalStock ?? 0;
      return {
        sectorId: meta.sectorId,
        stateId: meta.stateId,
        countryId: meta.countryId,
        sectorType: meta.sectorType,
        capacityUnits: Math.round(capacityUnits),
        units: bulkBuildUnits(
          body.rule,
          { sectorType: meta.sectorType, capacityUnits },
          MAX_BUILD_UNITS_PER_ORDER
        ),
        costLocal: 0,
        understaffed: (sector.labourStaffingFactor ?? 1) < 1,
        status: "ready",
        reason: null,
      };
    });

    // ─── preview: price every sector through the single-sector quote ─────────
    if (body.mode === "preview") {
      const quotes: BulkBuildQuoteRow[] = [];
      for (const [i, { sector }] of ordered.entries()) {
        const row = rows[i];
        const reason = quoteBlockedReason(sector);
        if (reason) {
          quotes.push({ sectorId: row.sectorId, costLocal: 0, blockedReason: reason });
          continue;
        }
        const quote = await placeCapacityBuild(db, {
          corporation,
          sector,
          userId: auth.user.userId,
          units: row.units,
          preview: true,
        });
        if (!quote.ok) {
          quotes.push({ sectorId: row.sectorId, costLocal: 0, blockedReason: quote.error });
        } else if (quote.queueFull) {
          quotes.push({
            sectorId: row.sectorId,
            costLocal: Number(quote.body.totalCostLocal) || 0,
            blockedReason: "Too many builds already under way here",
          });
        } else {
          quotes.push({
            sectorId: row.sectorId,
            costLocal: Number(quote.body.totalCostLocal) || 0,
            blockedReason: null,
          });
        }
      }
      const plan = planBulkBuild(quotes, corporation.liquidCapital);
      plan.rows.forEach((p, i) => {
        rows[i].costLocal = Math.round(p.costLocal);
        rows[i].status = p.status;
        rows[i].reason =
          p.status === "blocked"
            ? p.blockedReason
            : p.status === "over_budget"
              ? OVER_BUDGET_REASON
              : null;
      });
      return NextResponse.json({
        success: true,
        mode: "preview",
        currency,
        cashLocal: corporation.liquidCapital,
        readyCount: plan.readyCount,
        // Rounded UP: it becomes the confirmed spending cap, which identical prices must fit.
        readyCostLocal: Math.ceil(plan.readyCostLocal),
        cashAfterLocal: Math.round(plan.cashAfterLocal),
        maxSectors: BULK_BUILD_MAX_SECTORS,
        rows,
      });
    }

    // ─── apply: quote, then place, one sector at a time ──────────────────────
    const budget = body.maxTotalLocal!;
    let spentLocal = 0;
    let stopped = false;
    let builtCount = 0;
    const corpsCol = db.collection<Corporation>("corporations");
    for (const [i, { sector }] of ordered.entries()) {
      const row = rows[i];
      if (stopped) {
        row.status = "skipped";
        row.reason = OVER_BUDGET_REASON;
        continue;
      }
      const reason = quoteBlockedReason(sector);
      if (reason) {
        row.status = "skipped";
        row.reason = reason;
        continue;
      }
      // Fresh balance before every order: the previous one just spent from it,
      // and the build path quotes its insufficient-cash message from this doc.
      const fresh = await corpsCol.findOne({ _id: corporation._id });
      if (fresh) corporation = fresh;

      const quote = await placeCapacityBuild(db, {
        corporation,
        sector,
        userId: auth.user.userId,
        units: row.units,
        preview: true,
      });
      if (!quote.ok || quote.queueFull) {
        row.status = "skipped";
        row.reason = !quote.ok ? quote.error : "Too many builds already under way here";
        continue;
      }
      const quotedLocal = Number(quote.body.totalCostLocal) || 0;
      row.costLocal = Math.round(quotedLocal);
      if (quotedLocal > corporation.liquidCapital || spentLocal + quotedLocal > budget) {
        stopped = true;
        row.status = "skipped";
        row.reason =
          spentLocal + quotedLocal > budget
            ? "Would go past the total you confirmed"
            : OVER_BUDGET_REASON;
        continue;
      }

      const placed = await placeCapacityBuild(db, {
        corporation,
        sector,
        userId: auth.user.userId,
        units: row.units,
      });
      if (placed.ok) {
        row.status = "built";
        row.costLocal = Math.round(placed.chargedLocal);
        spentLocal += placed.chargedLocal;
        builtCount += 1;
        continue;
      }
      row.status = "skipped";
      row.reason = placed.error;
      // The build path's own balance guard refused: cash is gone, stop spending.
      if (placed.code === "insufficient_cash") {
        stopped = true;
        row.reason = OVER_BUDGET_REASON;
      }
    }

    const after = await corpsCol.findOne(
      { _id: corporation._id },
      { projection: { liquidCapital: 1 } }
    );
    return NextResponse.json({
      success: true,
      mode: "apply",
      currency,
      builtCount,
      spentLocal: Math.round(spentLocal),
      cashAfterLocal: after?.liquidCapital ?? corporation.liquidCapital,
      maxSectors: BULK_BUILD_MAX_SECTORS,
      rows,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Bulk-only skips, on top of everything the build path itself refuses. A
 * mothballed sector would take the new capacity cold, which is why its own
 * build dialog refuses too.
 */
function quoteBlockedReason(sector: CorporateSector): string | null {
  if (sector.mothballed === true) return "Mothballed. Reactivate it before adding capacity.";
  return null;
}
