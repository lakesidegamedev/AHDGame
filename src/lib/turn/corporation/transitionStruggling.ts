/**
 * Funded-market transition relief for sectors that struggle after the switch
 * (owner decision 2026-10-21): during the transition window, any non-state
 * sector that lost money or sold nothing on a funded turn is marked, which
 * gives it the same relief as a sector classed over-built at opening (free
 * conversion at book value, no idle upkeep while mothballed). Each human owner
 * is told once, the first time any of their sectors is marked, with a link to
 * the company page where every marked sector can be mothballed or converted
 * in one click. Nothing changes a sector without the player.
 *
 * One bulkWrite for the marks and one notification batch.
 */
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import {
  inTransitionWindow,
  strugglingReason,
  transitionReliefEligible,
  TRANSITION_WINDOW_TURNS,
} from "@/lib/market/producerMarket/transitionRules";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { createNotifications, type NotificationInput } from "@/lib/notifications";

/** The player behind a corporation, or null for an NPP-run company with no human owner. */
function humanOwner(corp: Corporation): ObjectId | null {
  if (corp.ceoType !== "npp") return corp.userId ?? null;
  return corp.caretakerCeo?.underlyingUserId ?? null;
}

export async function markStrugglingTransitionSectors(
  db: Db,
  lookups: Pick<CorporationLookups, "corporations" | "sectorsByCorp">,
  receiptsBySectorId: ReadonlyMap<string, FundedReceipt> | undefined,
  turn: number,
  firstFundedTurn: number | undefined
): Promise<{ marked: number; owners: number }> {
  if (!receiptsBySectorId || firstFundedTurn == null) return { marked: 0, owners: 0 };
  if (!inTransitionWindow(turn, firstFundedTurn)) return { marked: 0, owners: 0 };

  const ops: AnyBulkWriteOperation<CorporateSector>[] = [];
  const newlyByOwner = new Map<string, { userId: ObjectId; corp: Corporation; count: number }>();
  const ownersAlreadyTold = new Set<string>();

  for (const corp of lookups.corporations) {
    if (isStateOwned(corp)) continue;
    const owner = humanOwner(corp);
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      if (transitionReliefEligible(sector)) {
        if (owner && sector.cutoverStruggling) ownersAlreadyTold.add(owner.toString());
        continue;
      }
      if (sector.mothballed === true) continue;
      const receipt = receiptsBySectorId.get(sector._id.toString());
      const reason = receipt ? strugglingReason(receipt) : null;
      if (!reason) continue;
      const mark = { sinceTurn: turn, reason };
      ops.push({
        updateOne: { filter: { _id: sector._id }, update: { $set: { cutoverStruggling: mark } } },
      });
      sector.cutoverStruggling = mark;
      if (owner) {
        const key = owner.toString();
        const entry = newlyByOwner.get(key) ?? { userId: owner, corp, count: 0 };
        entry.count++;
        newlyByOwner.set(key, entry);
      }
    }
  }

  if (ops.length > 0) await db.collection<CorporateSector>("corporateSectors").bulkWrite(ops);

  const turnsLeft = firstFundedTurn + TRANSITION_WINDOW_TURNS - turn;
  const notices: NotificationInput[] = [];
  for (const [key, { userId, corp, count }] of newlyByOwner) {
    if (ownersAlreadyTold.has(key)) continue;
    notices.push({
      userId,
      type: "market_transition_review",
      title: "Some of your plants are losing money in the new market",
      message: `${count} of your sectors lost money or sold nothing last turn. For the next ${turnsLeft} turns you can mothball them with no upkeep or convert them to another industry for free. Open ${corp.name} to review them; nothing changes unless you choose.`,
      metadata: { corporationId: corp._id.toHexString() },
    });
  }
  if (notices.length > 0) await createNotifications(notices);
  return { marked: ops.length, owners: notices.length };
}
