import { CONCURRENT_VOTE_STAGE } from "@/lib/turn/billLifecycle/configs/concurrentVoteStage";
import type { Db } from "mongodb";
import { createNotifications } from "@/lib/notifications";
import type { Bill } from "@/lib/db/types";
import { getOfficeTypeForChamber } from "@/lib/legislature/chamberOfficeType";
import type { BillLifecycleConfig, SponsorNotifier } from "@/lib/turn/billLifecycle/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { billWhipsCollection } from "@/lib/db/repositories/billWhips";
import type { Document } from "mongodb";

const VOTING_HOURS = 24;

/**
 * Notify a JP bill's sponsor. Diet notifications are free-form per transition;
 * the engine calls this with the transition's target status, so we key the copy
 * on status (best-effort). The legacy resolver had four distinct "failed" copies
 * and per-transition wording; those collapse here (notification copy is not part
 * of the parity contract — createNotifications is fire-and-forget).
 */
const notifyJPSponsor: SponsorNotifier = async (db: Db, bill: Bill, status: Bill["status"]) => {
  if (!bill.sponsorId) return;
  const message =
    status === "active"
      ? "Your cabinet bill passed review and enters the Shugiin for debate."
      : status === "active_other"
        ? "Your bill passed the Shugiin and moves to the Sangiin."
        : status === "override_shugiin"
          ? "Your bill was rejected by the Sangiin. The Shugiin may attempt a 2/3 override."
          : status === "signed"
            ? "Your bill passed the Diet and is now law."
            : status === "failed"
              ? "Your bill failed in the Diet."
              : null;
  if (!message) return;
  try {
    const sponsor = await charactersCollection(db).findOne(
      { _id: bill.sponsorId },
      { projection: { userId: 1 } }
    );
    if (!sponsor) return;
    await createNotifications([
      {
        userId: sponsor.userId,
        type: "system",
        title: `Diet Bill: ${bill.title}`,
        message,
        metadata: { billId: bill._id.toString() },
      },
    ]);
  } catch {
    // Non-critical.
  }
};

/**
 * Japan Diet national lifecycle:
 *  - cabinet_review: cabinet vote of player-held positions, simple majority; pass re-enters Shūgiin (active, fresh vote), fail to failed.
 *  - active (Shūgiin): pass advances to Sangiin (active_other), fail to failed.
 *  - active_other (Sangiin): pass to signed (no executive veto); reject routes by origin: sangiin-origin to failed, Shūgiin/cabinet-origin to override_shugiin (fresh Shūgiin vote, whip records cleared).
 *  - override_shugiin: 2/3 of Shūgiin votes cast; pass to signed, fail to failed.
 * Frozen while JP government is forming. Votes scoped to current seat holders.
 */
export const JP_NATIONAL_CONFIG: BillLifecycleConfig = {
  country: "JP",
  level: "national",
  originChambers: ["shugiin", "sangiin", "cabinet"],
  skipWhenGovPending: true,
  notifySponsor: notifyJPSponsor,
  stages: [
    {
      kind: "chamberVote",
      status: "cabinet_review",
      voteField: "votes",
      // Cabinet review is a vote of player-held cabinet positions, not an elected
      // chamber — "cabinet" matches no electedOfficials, so it falls back to the
      // raw votes-cast majority (matching the legacy un-scoped cabinet vote).
      officeTypeFor: () => "cabinet",
      passRule: "simpleMajority",
      onReject: "fail",
      onPassStatus: "active",
      votingDurationHours: VOTING_HOURS,
    },
    {
      kind: "chamberVote",
      status: "active",
      voteField: "votes",
      officeTypeFor: (b) => getOfficeTypeForChamber("JP", b.currentChamber),
      passRule: "simpleMajority",
      onReject: "fail",
      onPassStatus: "active_other",
      votingDurationHours: VOTING_HOURS,
      chamberOnEnter: () => "shugiin", // cabinet → active re-enters the Shūgiin
    },
    {
      kind: "chamberVote",
      status: "active_other",
      voteField: "otherChamberVotes",
      officeTypeFor: (b) => getOfficeTypeForChamber("JP", b.currentChamber),
      passRule: "simpleMajority",
      onReject: "fail",
      // Shūgiin supremacy: sangiin-origin bills cannot be overridden; Shūgiin- or
      // cabinet-origin bills return to the Shūgiin for a 2/3 override.
      onRejectFn: (b) =>
        b.originChamber === "sangiin" ? "fail" : { toStatus: "override_shugiin" },
      onPassStatus: "signed",
      votingDurationHours: VOTING_HOURS,
      chamberOnEnter: () => "sangiin",
    },
    {
      kind: "chamberVote",
      status: "override_shugiin",
      voteField: "votes",
      officeTypeFor: (b) => getOfficeTypeForChamber("JP", b.currentChamber),
      passRule: "twoThirdsCast",
      onReject: "fail",
      onPassStatus: "signed",
      votingDurationHours: VOTING_HOURS,
      chamberOnEnter: () => "shugiin",
      clearWhippedFrom: true,
      onEnterHook: async (db, bill) => {
        // Clear Shūgiin whip records from the original phase so the override is a
        // fresh vote (2-whip allowance + cross-pressure resolver reset).
        await billWhipsCollection<Document>(db).deleteMany({
          targetType: "bill",
          targetId: (bill as { _id: unknown })._id,
          chamber: "shugiin",
        });
      },
    },
    CONCURRENT_VOTE_STAGE,
  ],
};

/**
 * Japan's registration in the turn loop's bill-lifecycle phase table; the
 * runner function is composed in `src/lib/turn/countryPhases.ts`.
 *
 * `fn` is deliberately not here: `runBillLifecycleForJP` lives in
 * `turn/billLifecycle/dispatch`, which reaches this module back through
 * `configs/jp`, so naming it would be a real runtime import cycle.
 *
 * `emptyResult` is not boilerplate. Japan reports `overrides` and
 * `cabinetPassed` in addition to `enacted` and `failed`, because the Diet can
 * pass a bill by cabinet route and the upper house can be overridden. Omitting
 * those keys would make a turn summary render them blank rather than "0".
 */
export const JP_BILL_PHASE_SHAPE = {
  phaseName: "jpBillLifecycle",
  emptyResult: { enacted: 0, failed: 0, overrides: 0, cabinetPassed: 0 },
} as const;
