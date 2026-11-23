/**
 * Fills vacant Supreme Court seats when no player President is nominating.
 *
 * A player President nominates through the White House route. When the
 * presidency is held by an NPP, or is vacant, nobody could nominate and each
 * death or retirement shrank the Court for good. This phase files a generated
 * legal-scholar nomination for one vacant seat per turn; the existing Senate
 * lifecycle (`scotusNominationLifecycle`) votes and seats the nominee.
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getElectedOfficialsCollection } from "@/lib/db/collections";
import type { ScotusNomination, SupremeCourtSeat } from "@/lib/db/types/scotus";
import { createJusticeNomination } from "@/lib/scotus/nominateJustice";
import {
  chooseNppNominatingParty,
  isRenominationCoolingDown,
  playerNominationGraceElapsed,
  SCOTUS_PLAYER_NOMINATION_GRACE_TURNS,
  vacancyReminderDue,
  type ScotusPresidencySnapshot,
} from "@/lib/scotus/rules/nppNomination";
import { supremeCourtSeatsCollection } from "@/lib/db/repositories/supremeCourtSeats";
import { scotusNominationsCollection } from "@/lib/db/repositories/scotusNominations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { createNotifications, type NotificationInput } from "@/lib/notifications";

export interface ScotusNppNominationResult {
  nominated: number;
  skipped?: "player-president" | "no-vacancy" | "no-party";
}

const VACANT_PRESIDENCY_NAME = "The Administration";

export async function processScotusNppNominations(
  currentTurn: number,
  db?: Db
): Promise<ScotusNppNominationResult> {
  const database = db ?? (await getDb());

  const vacantSeats = await supremeCourtSeatsCollection(database)
    .find({
      countryId: "US",
      justiceCharacterId: null,
      justiceNppId: null,
      justiceMode: { $ne: "historical" },
    })
    .sort({ seatNumber: 1 })
    .toArray();
  if (vacantSeats.length === 0) return { nominated: 0, skipped: "no-vacancy" };

  const officials = await getElectedOfficialsCollection(database);
  const president = await officials.findOne({ countryId: "US", officeType: "president" });
  const presidency: ScotusPresidencySnapshot = president?.characterId
    ? { kind: "player", party: president.party }
    : president?.nppId
      ? { kind: "npp", party: president.party }
      : { kind: "vacant" };

  // Start each vacancy's clock the first turn it is seen, so a player President
  // who never nominates cannot leave the Court short forever.
  const unstamped = vacantSeats.filter((seat) => seat.vacantSinceTurn == null);
  if (unstamped.length > 0) {
    await supremeCourtSeatsCollection(database).updateMany(
      { _id: { $in: unstamped.map((seat) => seat._id) } },
      { $set: { vacantSinceTurn: currentTurn } }
    );
    for (const seat of unstamped) seat.vacantSinceTurn = currentTurn;
  }
  if (presidency.kind === "player" && president?.characterId)
    await remindPlayerPresident(database, president.characterId, vacantSeats, currentTurn);
  const nominatableSeats =
    presidency.kind === "player"
      ? vacantSeats.filter((seat) =>
          playerNominationGraceElapsed(seat.vacantSinceTurn, currentTurn)
        )
      : vacantSeats;
  if (nominatableSeats.length === 0 && presidency.kind === "player") {
    return { nominated: 0, skipped: "player-president" };
  }

  const senate =
    presidency.kind === "vacant"
      ? (
          await officials
            .find(
              { countryId: "US", officeType: "senate" },
              { projection: { party: 1, seatsHeld: 1 } }
            )
            .toArray()
        ).map((o) => ({ party: o.party, seats: o.seatsHeld ?? 1 }))
      : [];
  const party = chooseNppNominatingParty(
    presidency.kind === "player" ? { kind: "npp", party: presidency.party } : presidency,
    senate
  );
  if (!party) return { nominated: 0, skipped: "no-party" };

  const recent = await scotusNominationsCollection(database)
    .find(
      { countryId: "US", seatNumber: { $in: nominatableSeats.map((s) => s.seatNumber) } },
      { projection: { seatNumber: 1, votingEndsOnTurn: 1, status: 1 } }
    )
    .toArray();
  const latestEndBySeat = new Map<number, number>();
  for (const nom of recent) {
    const ends = nom.votingEndsOnTurn;
    if (ends == null) continue;
    latestEndBySeat.set(
      nom.seatNumber,
      Math.max(latestEndBySeat.get(nom.seatNumber) ?? ends, ends)
    );
  }

  // One nomination per turn keeps a mass vacancy from flooding the Senate.
  for (const seat of nominatableSeats) {
    if (isRenominationCoolingDown(latestEndBySeat.get(seat.seatNumber), currentTurn)) continue;
    const result = await createJusticeNomination(database, {
      countryId: "US",
      seatNumber: seat.seatNumber,
      proposedByPresidentId: president?.nppId ?? president?.characterId ?? new ObjectId(),
      proposedByPresidentName: president?.characterName ?? VACANT_PRESIDENCY_NAME,
      generateNppLegalScholar: { party },
    });
    if (result.ok) return { nominated: 1 };
  }
  return { nominated: 0 };
}

/** Tells a player President about an open seat, and again halfway to the automatic nominee. */
async function remindPlayerPresident(
  database: Db,
  characterId: ObjectId | string,
  seats: SupremeCourtSeat[],
  currentTurn: number
): Promise<void> {
  const pending = await scotusNominationsCollection(database)
    .find(
      {
        countryId: "US",
        seatNumber: { $in: seats.map((seat) => seat.seatNumber) },
        votingEndsOnTurn: { $gte: currentTurn },
      },
      { projection: { seatNumber: 1 } }
    )
    .toArray();
  const underVote = new Set(pending.map((nom) => nom.seatNumber));
  const due = seats.flatMap((seat) => {
    if (underVote.has(seat.seatNumber)) return [];
    const stage = vacancyReminderDue(seat.vacantSinceTurn, seat.vacancyReminderStage, currentTurn);
    return stage ? [{ seat, stage }] : [];
  });
  if (due.length === 0) return;
  const character = await charactersCollection(database).findOne(
    { _id: new ObjectId(String(characterId)) },
    { projection: { userId: 1 } }
  );
  const notifications: NotificationInput[] = [];
  for (const { seat, stage } of due) {
    const deadline = (seat.vacantSinceTurn ?? currentTurn) + SCOTUS_PLAYER_NOMINATION_GRACE_TURNS;
    if (character?.userId)
      notifications.push({
        userId: character.userId as ObjectId,
        type: "system",
        title:
          stage === 1
            ? `Supreme Court seat ${seat.seatNumber} is vacant`
            : `Supreme Court seat ${seat.seatNumber} still needs a nominee`,
        message: `Nominate a justice from the White House page by turn ${deadline}. If the seat is still empty then, the Administration files a nominee from your party and the Senate votes as usual.`,
        metadata: { recipientCharacterId: String(characterId), seatNumber: seat.seatNumber },
      });
    await supremeCourtSeatsCollection(database).updateOne(
      { _id: seat._id },
      { $set: { vacancyReminderStage: stage } }
    );
  }
  await createNotifications(notifications);
}
