import { afterCommit, withSessionDb } from "@/lib/db/sessionDb";
import type { Db, ObjectId } from "mongodb";
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { createNotifications, type NotificationInput } from "@/lib/notifications";

import type { OfficeType } from "@/lib/db/types/character";
import { cabinetOfficeTypeForCountry } from "@/lib/actions/officeActionBonus";
import { getCabinetEligibleOfficeTypes } from "@/lib/legislature/chamberOfficeType";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import { cabinetNominationsCollection } from "@/lib/db/repositories/cabinetNominations";
import { cabinetSettingsCollection } from "@/lib/db/repositories/cabinetSettings";
import type { Document } from "mongodb";
import { ministerialOrdersCollection } from "@/lib/db/repositories/ministerialOrders";

/**
 * For the cleared cabinet holders, (1) restore each holder's `currentOffice` so
 * they stop drawing the cabinet office-action bonus after the government falls,
 * and (2) notify the player ones. Mirrors the PM-facing fire flow: restore to
 * the holder's legislative seat (from `electedOfficials`) or unset it when there
 * is none. Guarded — a holder whose `currentOffice` has already moved on (no
 * longer the cabinet office type) is left untouched, never clobbered.
 */
export async function notifyAndRestoreClearedHolders(
  db: Db,
  countryId: CountryId,
  memberIds: ObjectId[],
  /**
   * What to tell the cleared holders. Defaults to the government-transition
   * wording. Callers clearing a seat for another reason MUST pass their own,
   * or the holder is told their government fell when it did not.
   */
  notice: { title: string; message: string } = {
    title: "Cabinet Resigned",
    message: "Your cabinet appointment has ended due to a change in government.",
  }
): Promise<void> {
  if (memberIds.length === 0) return;

  const cabinetType = cabinetOfficeTypeForCountry(countryId);
  const eligibleOfficeTypes = getCabinetEligibleOfficeTypes(countryId);
  const [chars, seats] = await Promise.all([
    charactersCollection(db)
      .find({ _id: { $in: memberIds } }, { projection: { _id: 1, userId: 1, currentOffice: 1 } })
      .toArray(),
    electedOfficialsCollection(db)
      .find({
        characterId: { $in: memberIds },
        countryId,
        officeType: { $in: eligibleOfficeTypes },
      })
      .toArray(),
  ]);
  const seatByChar = new Map(
    seats.filter((s) => s.characterId).map((s) => [s.characterId!.toString(), s])
  );

  const now = new Date();
  for (const c of chars) {
    // Only ex-ministers still flagged as cabinet get reset — don't clobber a
    // holder whose office already moved on (e.g. re-seated elsewhere).
    if (c.currentOffice?.type !== cabinetType) continue;
    const seat = seatByChar.get(c._id.toString());
    if (seat?.state) {
      // Keep a Commons seat's constituency so ex-ministers don't lose their label.
      const restoreOffice = {
        type: seat.officeType,
        state: seat.state,
        ...(seat.officeType === "commons" && seat.constituencyId
          ? {
              constituency: seat.constituency ?? seat.constituencyId,
              constituencyId: seat.constituencyId,
            }
          : {}),
      } as OfficeType;
      await charactersCollection(db).updateOne(
        { _id: c._id },
        { $set: { currentOffice: restoreOffice, updatedAt: now } }
      );
    } else {
      await charactersCollection(db).updateOne(
        { _id: c._id },
        { $unset: { currentOffice: "" }, $set: { updatedAt: now } }
      );
    }
  }

  const notifications: NotificationInput[] = chars
    .filter((c) => c.userId)
    .map((c) => ({
      userId: c.userId,
      type: "system",
      title: notice.title,
      message: notice.message,
    }));
  if (notifications.length > 0) await afterCommit(db, () => createNotifications(notifications));
}

/**
 * Clears all cabinet members and pending nominations for the given country
 * when a government transition occurs (new President/PM, or government falls).
 *
 * Restores each cleared holder's `currentOffice` (so they stop drawing the
 * cabinet office bonus) and sends in-app notifications to the player ones.
 * Holder restoration commits with roster cleanup; notifications follow commit.
 *
 * Note: Does NOT clear UK cabinet cooldowns — those persist across government transitions
 * and are only cleared when a new PM is appointed (in ukGovernmentFormation.ts).
 */
export async function clearCabinetOnTransition(db: Db, countryId: CountryId): Promise<void> {
  await withSessionDb(db, (tx) => clearCabinetInTransaction(tx, countryId));
}

async function clearCabinetInTransaction(db: Db, countryId: CountryId): Promise<void> {
  const positions = getCabinetPositions(countryId);
  if (positions.length === 0) return;
  const positionIds = positions.map((p) => p.id);

  const filter = { countryId, positionId: { $in: positionIds } };

  if (countryId === COUNTRY_CONFIGS.US.id) {
    // Handle US cabinet (confirmation-based)
    const members = await cabinetMembersCollection(db).find(filter).toArray();
    await cabinetMembersCollection(db).deleteMany(filter);
    await cabinetNominationsCollection(db).updateMany(
      { ...filter, status: { $in: ["proposed", "active", "awaiting_choice"] } },
      { $set: { status: "withdrawn", updatedAt: new Date() } }
    );

    // Restore office state for the cleared secretaries and notify the players.
    // NPP-held seats carry a null characterId: no player to notify, no office
    // to restore, so they are filtered out here.
    await notifyAndRestoreClearedHolders(
      db,
      countryId,
      members.map((m) => m.characterId).filter((id): id is NonNullable<typeof id> => id != null)
    );
  } else {
    // Parliamentary / one-party cabinets (UK, JP, DE, IE, CN, NG). The unified
    // cabinetMembers collection is the single source of truth for seat holders,
    // so a transition clears the country's seats there and restores/notifies the
    // affected players.
    const members = await cabinetMembersCollection(db)
      .find({ ...filter, countryId })
      .toArray();

    await cabinetMembersCollection(db).deleteMany({ ...filter, countryId });

    await cabinetNominationsCollection(db).updateMany(
      { ...filter, countryId, status: { $in: ["proposed", "active", "awaiting_choice"] } },
      { $set: { status: "withdrawn", updatedAt: new Date() } }
    );

    await cabinetSettingsCollection<Document>(db).deleteMany({ countryId });
    await ministerialOrdersCollection<Document>(db).updateMany(
      { countryId, active: true },
      { $set: { active: false } }
    );

    // Restore office state and notify the player holders. NPP-held seats carry a
    // null characterId — they have no player to notify and no office to restore.
    const memberIds = members
      .map((m) => m.characterId)
      .filter((id): id is NonNullable<typeof id> => id != null);
    await notifyAndRestoreClearedHolders(db, countryId, memberIds);
  }
}
