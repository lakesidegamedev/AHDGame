/**
 * Once a turn: Competition Act breakup cases (levels 3 and 4).
 *
 * 1. A group whose share of a national industry reaches the country's
 *    breakup threshold gets a case, decided by the competition authority
 *    (the same seat that reviews mergers) within BREAKUP_CASE_TURNS.
 * 2. When the case is decided, or its deadline passes, the share is measured
 *    again. Below the threshold, the case is dismissed. Otherwise, unless the
 *    authority dismissed it, the group receives a divestiture order: the same
 *    obligation a remedied merger carries, so the existing merger sweep
 *    discharges it once the group falls below the threshold and fines it while
 *    overdue.
 *
 * Uses the control rows, industry rows and law levels the compliance pass has
 * already built; reads the authority only for countries with a new case.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CorporationType } from "@/lib/constants/corporations";
import type { PendingDivestiture } from "@/lib/db/types/mergerReview";
import {
  BREAKUP_CASE_TURNS,
  findDominantGroups,
  type ControlRow,
  type IndustryRow,
} from "@/lib/mechanicalLaws/enforcementRules";
import type { MechanicalLawLevel } from "@/lib/mechanicalLaws/rules";
import { MERGER_REMEDY_TURNS, thresholdForLevel } from "@/lib/corporations/mergerReview/constants";
import { resolveMergerAuthority } from "@/lib/corporations/mergerReview/authority";
import type { NotificationInput } from "@/lib/notifications";

export interface BreakupResult {
  opened: number;
  ordered: number;
  dismissed: number;
}

export async function processBreakupCases(
  db: Db,
  args: {
    corporations: readonly Corporation[];
    rows: readonly ControlRow[];
    industry: readonly IndustryRow[];
    competitionLevelByCountry: ReadonlyMap<string, MechanicalLawLevel>;
    turn: number;
    currentYear: number | null;
    notices: NotificationInput[];
  }
): Promise<BreakupResult> {
  const result: BreakupResult = { opened: 0, ordered: 0, dismissed: 0 };
  const { corporations, turn, notices } = args;
  const dominant = findDominantGroups({
    rows: args.rows,
    industry: args.industry,
    competitionLevelByCountry: args.competitionLevelByCountry,
    thresholdForCompetitionLevel: (level) => thresholdForLevel(level),
  });
  const dominantKey = new Set(dominant.map((d) => `${d.rootId}|${d.countryId}|${d.sectorType}`));
  const corpById = new Map(corporations.map((c) => [c._id.toString(), c]));
  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  const notifyOwner = (corp: Corporation, title: string, message: string) => {
    if (corp.userId) {
      notices.push({
        userId: corp.userId,
        type: "merger_review_decided",
        title,
        message,
        metadata: { corporationId: corp._id.toHexString() },
      });
    }
  };

  // Resolve open cases whose deadline passed or that the authority decided.
  for (const corp of corporations) {
    const open = corp.antitrustCase;
    if (!open) continue;
    if (!open.decision && turn < open.decideByTurn) continue;
    const stillDominant = dominantKey.has(
      `${corp._id.toString()}|${open.countryId}|${open.sectorType}`
    );
    if (!stillDominant || open.decision === "dismiss") {
      ops.push({
        updateOne: { filter: { _id: corp._id }, update: { $unset: { antitrustCase: "" } } },
      });
      delete corp.antitrustCase;
      result.dismissed++;
      notifyOwner(
        corp,
        "Competition case closed",
        `The competition authority closed its case against ${corp.name} in ${open.countryId} with no order.`
      );
      continue;
    }
    const obligation: PendingDivestiture = {
      reviewId: new ObjectId(),
      sectorType: open.sectorType as CorporationType,
      dueTurn: turn + MERGER_REMEDY_TURNS,
      thresholdPercent: open.thresholdPercent,
      countryId: open.countryId,
    };
    ops.push({
      updateOne: {
        filter: { _id: corp._id },
        update: { $set: { pendingDivestiture: obligation }, $unset: { antitrustCase: "" } },
      },
    });
    corp.pendingDivestiture = obligation;
    delete corp.antitrustCase;
    result.ordered++;
    notifyOwner(
      corp,
      "Breakup ordered",
      `The competition authority ordered ${corp.name}'s group to bring its share of the ${open.sectorType} industry in ${open.countryId} below ${open.thresholdPercent}% by turn ${obligation.dueTurn}. Until then it may not make new acquisitions, and once overdue it is fined each turn.`
    );
  }

  // Open new cases for dominant groups with no case or order already running.
  const newCases = dominant.filter((d) => {
    const root = corpById.get(d.rootId);
    return root && !root.antitrustCase && !root.pendingDivestiture && root.countryOwnerId == null;
  });
  const authorityByCountry = new Map<string, Awaited<ReturnType<typeof resolveMergerAuthority>>>();
  for (const countryId of new Set(newCases.map((d) => d.countryId))) {
    authorityByCountry.set(
      countryId,
      await resolveMergerAuthority(db, countryId, args.currentYear)
    );
  }
  for (const d of newCases) {
    const root = corpById.get(d.rootId)!;
    const antitrustCase = {
      countryId: d.countryId,
      sectorType: d.sectorType,
      sharePercent: Math.round(d.sharePercent * 10) / 10,
      thresholdPercent: d.thresholdPercent,
      openedTurn: turn,
      decideByTurn: turn + BREAKUP_CASE_TURNS,
    };
    ops.push({ updateOne: { filter: { _id: root._id }, update: { $set: { antitrustCase } } } });
    root.antitrustCase = antitrustCase;
    result.opened++;
    notifyOwner(
      root,
      "Competition case opened",
      `${root.name}'s group holds ${antitrustCase.sharePercent}% of the ${d.sectorType} industry in ${d.countryId}, above the ${d.thresholdPercent}% the Competition Act allows. The competition authority decides by turn ${antitrustCase.decideByTurn} whether to order a breakup.`
    );
    const authority = authorityByCountry.get(d.countryId);
    if (authority?.holderUserId) {
      notices.push({
        userId: authority.holderUserId,
        type: "merger_review_opened",
        title: "Breakup case to decide",
        message: `${root.name}'s group holds ${antitrustCase.sharePercent}% of the ${d.sectorType} industry. As ${authority.seatName} you may order a breakup or dismiss the case by turn ${antitrustCase.decideByTurn}; otherwise it follows the measured share.`,
        metadata: { corporationId: root._id.toHexString() },
      });
    }
  }

  if (ops.length > 0) await db.collection<Corporation>("corporations").bulkWrite(ops);
  return result;
}
