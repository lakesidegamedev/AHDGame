import {
  loadBankFailureEffects,
  bankFailureApprovalModifiers,
} from "@/lib/banking/failurePolitics";
import {
  loadMarketAdjustmentEffects,
  marketAdjustmentApprovalModifiers,
} from "@/lib/crises/marketAdjustment/approvalEffects";
import {
  fiscalConsolidationApprovalModifiers,
  loadFiscalConsolidationApprovalEffects,
} from "@/lib/budget/fiscalStabilizer";
import type { Db } from "mongodb";
import { COUNTRY_CONFIGS, COUNTRY_ORDER, type CountryId } from "@/lib/constants/countries";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { WAR_DEFEAT_WINDOW_TURNS } from "@/lib/military/rules/warDefeat";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import { snapshotApprovalHistory } from "@/lib/utils/governmentApproval";
import type { LongHorizonContext } from "@/lib/telemetry/longHorizon/telemetry";
import {
  belligerentsOf,
  guestsToRelease,
  planApprovalSnapshot,
} from "@/lib/utils/approvalSnapshotTargets";

/**
 * Orchestration for the per-turn approval snapshot: who gets one, and whose
 * document is handed back afterwards.
 *
 * Split out from `governmentApproval.ts` because it is a different job from
 * scoring one country, and because keeping it here lets its own test drive the
 * roster and the release decision with `snapshotApprovalHistory` stubbed out.
 * The bug this file exists to prevent — a guest document left on disk with
 * nothing that could ever remove it — lived in the wiring, not in the pure
 * helpers it calls, and had no test at that level.
 */

export interface ApprovalSnapshotRun {
  /** How many countries were snapshotted this turn. */
  countriesProcessed: number;
  /** Guests whose approval document was released because their war is over. */
  guestsReleased: CountryId[];
}

/**
 * Run the per-turn approval snapshot across every country that needs one.
 *
 * Must include non-`active` belligerents: every country has a reachable
 * approval page, but one without a `governmentApprovals` document falls back to
 * the live recompute, which carries none of the national providers. Guests are
 * released once their war is over and their exhaustion has healed.
 */
export async function snapshotApprovalsForTurn(
  db: Db,
  turn: number,
  telemetryCtx?: LongHorizonContext,
  bankFailurePolitics = false,
  marketAdjustmentStage = 0
): Promise<ApprovalSnapshotRun> {
  const activeIds = COUNTRY_ORDER.filter((id) => COUNTRY_CONFIGS[id].status === "active");
  const approvals = db.collection<GovernmentApproval>("governmentApprovals");

  const [conflicts, documentedDocs, seededStateCountries] = await Promise.all([
    getConflictsCollection(db)
      .find({
        $or: [
          { status: { $ne: "resolved" } },
          {
            status: "resolved",
            endTurn: { $gte: turn - (WAR_DEFEAT_WINDOW_TURNS - 1), $lte: turn },
          },
        ],
      })
      .toArray(),
    // Every country that already has an approval document, not merely those with
    // exhaustion left to heal. Two reasons, and the second is the load-bearing
    // one. Exhaustion only moves on a turn the snapshot runs for that country, so
    // a country dropped the moment its war ended would carry its wartime penalty
    // frozen for good; and releasing a guest's document only happens for
    // countries in this set, so a guest that leaves it by any route leaks its
    // document permanently. `planApprovalSnapshot` has the full argument.
    //
    // Cheap: one projection over a collection with one document per country that
    // has ever needed one.
    approvals.find({}, { projection: { _id: 1 } }).toArray(),
    db.collection("states").distinct("countryId"),
  ]);

  const known = (id: unknown): id is CountryId => typeof id === "string" && id in COUNTRY_CONFIGS;
  const belligerents = belligerentsOf(conflicts).filter(known);
  const documented = documentedDocs.map((doc) => doc._id).filter(known);
  const seeded = seededStateCountries.filter(known);

  const plan = planApprovalSnapshot(activeIds, belligerents, documented, seeded);
  const bankFailures = await loadBankFailureEffects(db, turn, bankFailurePolitics);
  const marketAdjustment = await loadMarketAdjustmentEffects(db, turn, marketAdjustmentStage);
  const fiscalConsolidation = await loadFiscalConsolidationApprovalEffects(db, turn);
  await Promise.all(
    plan.ids.map((id) => {
      const modifiers = [
        ...bankFailureApprovalModifiers(bankFailures.get(id)),
        ...marketAdjustmentApprovalModifiers(marketAdjustment.get(id)),
        ...fiscalConsolidationApprovalModifiers(fiscalConsolidation.get(id)),
      ];
      return modifiers.length > 0
        ? snapshotApprovalHistory(db, id, turn, telemetryCtx, modifiers)
        : snapshotApprovalHistory(db, id, turn, telemetryCtx);
    })
  );

  return {
    countriesProcessed: plan.ids.length,
    guestsReleased: await releaseApprovalGuests(db, plan.guests, belligerents),
  };
}

/**
 * Drop approval documents of guests whose war is finished.
 *
 * `loadNationalApproval` prefers a stored rating over live recompute, and
 * nothing refreshes a non-active country at peace. A document left behind
 * would pin that country's page to its last wartime number permanently.
 * A document written by another system without a snapshot keeping it current
 * is stale by construction; a stale rating is worse than none.
 *
 * Active countries are re-filtered as a cheap guard before deleting live
 * production documents.
 */
async function releaseApprovalGuests(
  db: Db,
  guests: CountryId[],
  belligerents: CountryId[]
): Promise<CountryId[]> {
  if (guests.length === 0) return [];

  const approvals = db.collection<GovernmentApproval>("governmentApprovals");
  const docs = await approvals
    .find({ _id: { $in: guests } }, { projection: { _id: 1, warExhaustion: 1 } })
    .toArray();
  const exhaustion = new Map(docs.map((doc) => [doc._id, doc.warExhaustion ?? 0]));

  const release = guestsToRelease(guests, belligerents, exhaustion).filter(
    (id) => COUNTRY_CONFIGS[id]?.status !== "active"
  );
  if (release.length === 0) return [];

  // Deleting a live document is worth a line in the turn log, so an operator
  // reading back a turn can see why a country's approval page went from a stored
  // rating to a recomputed one.
  console.info(
    `[approvalSnapshot] released approval documents for ${release.join(", ")}: war over, exhaustion healed`
  );
  await approvals.deleteMany({ _id: { $in: release } });
  return release;
}
