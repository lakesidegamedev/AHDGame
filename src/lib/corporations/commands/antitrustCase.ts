/**
 * The competition authority's decision on a Competition Act breakup case:
 * order a breakup, or dismiss. Only the player holding the country's
 * competition authority seat may decide; the turn's breakup pass carries the
 * decision out (re-measuring first, so a group that has already shrunk below
 * the threshold is never ordered).
 */
import type { Db, ObjectId } from "mongodb";
import { z } from "zod";
import type { Corporation } from "@/lib/db/types";
import { resolveMergerAuthority } from "@/lib/corporations/mergerReview/authority";

export const antitrustCaseDecisionSchema = z.object({
  decision: z.enum(["order", "dismiss"]),
});

export type AntitrustCaseDecisionResult =
  { ok: true } | { ok: false; status: 400 | 403 | 409; error: string };

export async function decideAntitrustCase(
  db: Db,
  corporation: Pick<Corporation, "_id" | "antitrustCase">,
  userId: ObjectId,
  decision: "order" | "dismiss",
  turn: number,
  currentYear: number | null
): Promise<AntitrustCaseDecisionResult> {
  const open = corporation.antitrustCase;
  if (!open) return { ok: false, status: 400, error: "There is no open competition case." };
  if (open.decision)
    return { ok: false, status: 409, error: "This case has already been decided." };
  const authority = await resolveMergerAuthority(db, open.countryId, currentYear);
  if (!authority?.holderUserId || !authority.holderUserId.equals(userId)) {
    return {
      ok: false,
      status: 403,
      error: "Only the competition authority of this country can decide the case.",
    };
  }
  const result = await db.collection<Corporation>("corporations").updateOne(
    {
      _id: corporation._id,
      "antitrustCase.openedTurn": open.openedTurn,
      "antitrustCase.decision": { $exists: false },
    },
    { $set: { "antitrustCase.decision": decision, "antitrustCase.decidedTurn": turn } }
  );
  if (result.modifiedCount !== 1) {
    return { ok: false, status: 409, error: "The case changed. Refresh and try again." };
  }
  return { ok: true };
}

/** The case as the company page shows it, plus whether the viewer may decide. */
export async function antitrustCaseView(
  db: Db,
  corporation: Pick<Corporation, "antitrustCase">,
  viewerUserId: ObjectId | null,
  currentYear: number | null
) {
  const open = corporation.antitrustCase;
  if (!open) return null;
  const authority = await resolveMergerAuthority(db, open.countryId, currentYear);
  return {
    ...open,
    authoritySeatName: authority?.seatName ?? null,
    authorityHolderName: authority?.holderName ?? null,
    viewerIsAuthority:
      !!viewerUserId && !!authority?.holderUserId && authority.holderUserId.equals(viewerUserId),
  };
}

export interface AntitrustOrdersView {
  /** Companies this group must give up control of, including this one if it is ordered out of its parent's group. */
  forcedSales: Array<{
    corporationId: string;
    corporationName: string;
    reason: NonNullable<Corporation["antitrustDivestiture"]>["reason"];
    countryId: string;
    dueTurn: number;
  }>;
  /** A breakup or merger-review order to bring this group's share of one industry under a threshold. */
  industryOrder: {
    sectorType: string;
    countryId: string;
    thresholdPercent: number;
    dueTurn: number;
  } | null;
}

/**
 * Standing antitrust orders on a corporation's group, public like the case
 * itself: forced sales of subsidiaries (on the subsidiary, keyed by its root)
 * and an industry-share order on the root. One read for the subsidiaries.
 */
export async function antitrustOrdersView(
  db: Db,
  corporation: Pick<Corporation, "_id" | "name" | "antitrustDivestiture" | "pendingDivestiture">
): Promise<AntitrustOrdersView> {
  const id = corporation._id.toString();
  const ordered = await db
    .collection<Corporation>("corporations")
    .find(
      { "antitrustDivestiture.rootCorporationId": id },
      { projection: { name: 1, antitrustDivestiture: 1 } }
    )
    .toArray();
  const rows = [...ordered];
  if (corporation.antitrustDivestiture && !rows.some((c) => c._id.equals(corporation._id))) {
    rows.push(corporation as Corporation);
  }
  const forcedSales = rows
    .filter((c) => c.antitrustDivestiture)
    .map((c) => ({
      corporationId: c._id.toString(),
      corporationName: c.name,
      reason: c.antitrustDivestiture!.reason,
      countryId: c.antitrustDivestiture!.countryId,
      dueTurn: c.antitrustDivestiture!.dueTurn,
    }))
    .sort((a, b) => a.dueTurn - b.dueTurn);
  const pending = corporation.pendingDivestiture;
  return {
    forcedSales,
    industryOrder: pending
      ? {
          sectorType: pending.sectorType,
          countryId: pending.countryId,
          thresholdPercent: pending.thresholdPercent,
          dueTurn: pending.dueTurn,
        }
      : null,
  };
}
