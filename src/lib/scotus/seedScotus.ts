import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { SupremeCourtSeat, DocketCase } from "@/lib/db/types/scotus";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { getScotusPresetSeed } from "./presetData";

/**
 * Seeds the SCOTUS Original Roster (9 seats) + Docket for the US. No-ops
 * when the preset's roster/docket content is not yet authored.
 *
 * Historical justices are seated from the preset's Original Roster. Tenure
 * vacates the first occupant on their authored date; every replacement is
 * nominated and confirmed live.
 *
 * With `reset=true`, wipes seats/docket/nominations first so a reset always
 * starts from the Original Roster rather than a stale divergent state.
 */
export async function seedScotus(
  db: Db,
  log: (msg: string) => void,
  preset: string,
  reset = false
): Promise<{ seatsSeeded: number; casesSeeded: number }> {
  const countryId = "US" as const;

  if (reset) {
    await Promise.all([
      db.collection("supremeCourtSeats").deleteMany({ countryId }),
      db.collection("docketCases").deleteMany({ countryId }),
      db.collection("scotusNominations").deleteMany({ countryId }),
    ]);
  }

  const data = getScotusPresetSeed(preset);
  if (!data || data.seats.length === 0) {
    log(`[scotus] No roster/docket content authored yet for preset "${preset}" — skipping.`);
    return { seatsSeeded: 0, casesSeeded: 0 };
  }

  const now = new Date();
  const startingYear = getStartingYearForPreset(preset);

  let seatsSeeded = 0;
  for (const seatSeed of data.seats) {
    const firstOccupant = seatSeed.historicalOccupants[0];
    const seat: Omit<SupremeCourtSeat, "_id"> = {
      countryId,
      seatNumber: seatSeed.seatNumber,
      justiceMode: firstOccupant ? "historical" : null,
      justiceCharacterId: null,
      justiceNppId: null,
      justiceName: firstOccupant?.name ?? null,
      justiceParty: firstOccupant?.party ?? null,
      economicLean: firstOccupant?.economicLean ?? null,
      socialLean: firstOccupant?.socialLean ?? null,
      seatedAt: firstOccupant ? now : null,
      seatedAtTurn: firstOccupant ? 1 : null,
      isDivergent: false,
      historicalOccupantIndex: firstOccupant ? 0 : -1,
      historicalOccupants: seatSeed.historicalOccupants,
      divergentHazardStartsTurn: null,
      createdAt: now,
      updatedAt: now,
    };
    await db
      .collection<SupremeCourtSeat>("supremeCourtSeats")
      .updateOne(
        { countryId, seatNumber: seatSeed.seatNumber },
        { $setOnInsert: { _id: new ObjectId(), ...seat } as SupremeCourtSeat },
        { upsert: true }
      );
    seatsSeeded++;
  }

  let casesSeeded = 0;
  for (const caseSeed of data.docket) {
    const docketCase: Omit<DocketCase, "_id"> = {
      countryId,
      preset,
      caseKey: caseSeed.caseKey,
      title: caseSeed.title,
      axis: caseSeed.axis,
      historicalMajorityDirection: caseSeed.historicalMajorityDirection,
      decisionYear: caseSeed.decisionYear,
      historicalOutcomeLocked: caseSeed.historicalOutcomeLocked,
      effect: caseSeed.effect,
      historicalSummary: caseSeed.historicalSummary,
      alternateSummary: caseSeed.alternateSummary,
      demographicSignal: caseSeed.demographicSignal,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await db
      .collection<DocketCase>("docketCases")
      .updateOne(
        { countryId, preset, caseKey: caseSeed.caseKey },
        { $setOnInsert: { _id: new ObjectId(), ...docketCase } as DocketCase },
        { upsert: true }
      );
    casesSeeded++;
  }

  log(
    `[scotus] Seeded ${seatsSeeded} Original Roster seat(s) + ${casesSeeded} docket case(s) for preset "${preset}" (starting year ${startingYear}).`
  );
  return { seatsSeeded, casesSeeded };
}
