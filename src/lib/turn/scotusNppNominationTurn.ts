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
  type ScotusPresidencySnapshot,
} from "@/lib/scotus/rules/nppNomination";

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

  const vacantSeats = await database
    .collection<SupremeCourtSeat>("supremeCourtSeats")
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
  if (presidency.kind === "player") return { nominated: 0, skipped: "player-president" };

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
  const party = chooseNppNominatingParty(presidency, senate);
  if (!party) return { nominated: 0, skipped: "no-party" };

  const recent = await database
    .collection<ScotusNomination>("scotusNominations")
    .find(
      { countryId: "US", seatNumber: { $in: vacantSeats.map((s) => s.seatNumber) } },
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
  for (const seat of vacantSeats) {
    if (isRenominationCoolingDown(latestEndBySeat.get(seat.seatNumber), currentTurn)) continue;
    const result = await createJusticeNomination(database, {
      countryId: "US",
      seatNumber: seat.seatNumber,
      proposedByPresidentId: president?.nppId ?? new ObjectId(),
      proposedByPresidentName: president?.characterName ?? VACANT_PRESIDENCY_NAME,
      generateNppLegalScholar: { party },
    });
    if (result.ok) return { nominated: 1 };
  }
  return { nominated: 0 };
}
