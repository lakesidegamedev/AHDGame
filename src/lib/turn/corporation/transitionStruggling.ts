/**
 * Funded-market transition relief for struggling sectors: during the
 * transition window, any non-state sector that lost money or sold nothing on
 * a funded turn is marked, giving it the same relief as an over-built sector
 * (free conversion at book value, no idle upkeep while mothballed). Owners
 * are notified at most once every TRANSITION_RENOTICE_TURNS turns, linking
 * to the company page where marked sectors can be mothballed or converted.
 * Nothing changes a sector without the player.
 */
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import {
  inTransitionWindow,
  strugglingReason,
  transitionReliefEligible,
  TRANSITION_RENOTICE_TURNS,
  TRANSITION_WINDOW_TURNS,
  type CutoverStruggling,
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
  firstFundedTurn: number | undefined,
  /** Own-site deliveries booked at market value (producerCaptiveDeliveryStage >= 3). */
  managementAccounts = false
): Promise<{ marked: number; owners: number }> {
  if (!receiptsBySectorId || firstFundedTurn == null) return { marked: 0, owners: 0 };
  if (!inTransitionWindow(turn, firstFundedTurn)) return { marked: 0, owners: 0 };

  const newlyByOwner = new Map<
    string,
    { userId: ObjectId; corp: Corporation; sectors: CorporateSector[] }
  >();
  const unowned: CorporateSector[] = [];
  const reasons = new Map<CorporateSector, CutoverStruggling["reason"]>();
  // Last turn each owner was told: the newest mark set with a notice.
  const lastToldByOwner = new Map<string, number>();
  // Marks set quietly inside the gap, so the next notice can count and stamp them.
  const quietByOwner = new Map<
    string,
    { userId: ObjectId; corp: Corporation; sectors: CorporateSector[] }
  >();

  for (const corp of lookups.corporations) {
    if (isStateOwned(corp)) continue;
    const owner = humanOwner(corp);
    for (const sector of lookups.sectorsByCorp.get(corp._id.toString()) ?? []) {
      if (transitionReliefEligible(sector)) {
        const mark = sector.cutoverStruggling;
        const told = mark && mark.notified !== false ? mark.sinceTurn : undefined;
        if (owner && told != null) {
          const key = owner.toString();
          lastToldByOwner.set(key, Math.max(lastToldByOwner.get(key) ?? -Infinity, told));
        }
        if (owner && mark?.notified === false) {
          const key = owner.toString();
          const entry = quietByOwner.get(key) ?? { userId: owner, corp, sectors: [] };
          entry.sectors.push(sector);
          quietByOwner.set(key, entry);
        }
        continue;
      }
      if (sector.mothballed === true) continue;
      const receipt = receiptsBySectorId.get(sector._id.toString());
      const reason = receipt ? strugglingReason(receipt, managementAccounts) : null;
      if (!reason) continue;
      reasons.set(sector, reason);
      if (owner) {
        const key = owner.toString();
        const entry = newlyByOwner.get(key) ?? { userId: owner, corp, sectors: [] };
        entry.sectors.push(sector);
        newlyByOwner.set(key, entry);
      } else {
        unowned.push(sector);
      }
    }
  }

  const ops: AnyBulkWriteOperation<CorporateSector>[] = [];
  const stamp = (sector: CorporateSector, notified: boolean) => {
    const mark: CutoverStruggling = {
      sinceTurn: turn,
      reason: reasons.get(sector)!,
      notified,
    };
    ops.push({
      updateOne: { filter: { _id: sector._id }, update: { $set: { cutoverStruggling: mark } } },
    });
    sector.cutoverStruggling = mark;
  };
  for (const sector of unowned) stamp(sector, false);

  const turnsLeft = firstFundedTurn + TRANSITION_WINDOW_TURNS - turn;
  const notices: NotificationInput[] = [];
  // Owners with quiet marks but nothing new this turn still get their catch-up notice.
  for (const [key, entry] of quietByOwner) {
    if (!newlyByOwner.has(key)) newlyByOwner.set(key, { ...entry, sectors: [] });
  }
  for (const [key, { userId, corp, sectors }] of newlyByOwner) {
    const lastTold = lastToldByOwner.get(key);
    const notify = lastTold == null || turn - lastTold >= TRANSITION_RENOTICE_TURNS;
    for (const sector of sectors) stamp(sector, notify);
    if (!notify) continue;
    const quiet = quietByOwner.get(key)?.sectors ?? [];
    for (const sector of quiet) {
      // Restamped to this turn: a notified mark's sinceTurn is when its owner was told.
      const mark = { ...sector.cutoverStruggling!, notified: true, sinceTurn: turn };
      ops.push({
        updateOne: { filter: { _id: sector._id }, update: { $set: { cutoverStruggling: mark } } },
      });
      sector.cutoverStruggling = mark;
    }
    const count = sectors.length + quiet.length;
    if (count === 0) continue;
    notices.push({
      userId,
      type: "market_transition_review",
      title: "Some of your plants are losing money in the new market",
      message: `${count}${lastTold == null ? "" : " more"} of your sectors lost money or sold nothing last turn. For the next ${turnsLeft} turns you can mothball them with no upkeep or convert them to another industry for free. Open ${corp.name} to review them; nothing changes unless you choose.`,
      metadata: { corporationId: corp._id.toHexString() },
    });
  }

  if (ops.length > 0) await db.collection<CorporateSector>("corporateSectors").bulkWrite(ops);
  if (notices.length > 0) await createNotifications(notices);
  return { marked: reasons.size, owners: notices.length };
}
