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
