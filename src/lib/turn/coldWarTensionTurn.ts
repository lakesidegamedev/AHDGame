import type { Db } from "mongodb";
import { runTensionTurn, type ColdWarTensionState } from "@/lib/coldwar/tension";
import {
  readStandingPressureSnapshot,
  syncLimitedWarPressureClocks,
  type StandingPressureSnapshot,
} from "@/lib/coldwar/standingPressure";
import {
  BLOC_TENSION_FIRST_YEAR,
  blocDyadFloors,
  blocOfAlignment,
  type BlocPairId,
} from "@/lib/coldwar/rules/blocTension";
import type { CountryAlignment } from "@/lib/db/types/countryAlignment";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";

/**
 * Turn phase for global cold-war tension: read the world's standing pressure
 * and relax the shared tension value toward the floor it implies.
 *
 * The pressures mirror what the dials layer reads. The Vietnam rung comes off
 * the same legacy/living-conflict selection `getColdWarDials` makes, so the
 * phase and the console can never disagree about which ladder is live. Active
 * crises, the world's total stockpile, and the wars on the Conflicts board
 * round out the floor: an armed, embroiled world never reads calm, however
 * long nobody tests anything. A war between nuclear-armed coalitions reads
 * CRISIS at minimum, not "elevated".
 */
export async function processColdWarTensionTurn(
  db: Db,
  turn: number,
  gameState: { livingConflictsEnabled?: boolean; currentYear?: number }
): Promise<ColdWarTensionState | null> {
  await syncLimitedWarPressureClocks(db, turn);
  const snapshot = await readStandingPressureSnapshot(db, gameState, turn);
  if ((gameState.currentYear ?? 0) < BLOC_TENSION_FIRST_YEAR) {
    return runTensionTurn(db, turn, snapshot.pressures);
  }
  return runTensionTurn(db, turn, snapshot.pressures, await loadBlocDyadFloors(db, turn, snapshot));
}

/**
 * The 2027 multipolar floors (#5695): two projected reads, alignment rows for
 * who sits in which bloc and the embargoes in force, joined with the wars the
 * standing-pressure snapshot already read.
 */
export async function loadBlocDyadFloors(
  db: Db,
  turn: number,
  snapshot: Pick<StandingPressureSnapshot, "wars" | "nuclearCountries">
): Promise<Record<BlocPairId, number>> {
  const [alignments, embargoes] = await Promise.all([
    db
      .collection<CountryAlignment>("countryAlignments")
      .find({}, { projection: { entityId: 1, shares: 1, nonAligned: 1 } })
      .toArray(),
    db
      .collection<TradeEmbargo>("tradeEmbargoes")
      .find(
        {
          $or: [
            { expiresTurn: { $exists: false } },
            { expiresTurn: null },
            { expiresTurn: { $gte: turn } },
          ],
        } as never,
        { projection: { sourceCountry: 1, targetCountry: 1 } }
      )
      .toArray(),
  ]);
  const rows = new Map(alignments.map((row) => [String(row.entityId), row]));
  // One embargo per country pair: a pair embargoed on five commodities is one
  // act of hostility, not five.
  const pairs = new Map<string, { sourceCountry: string; targetCountry: string }>();
  for (const e of embargoes) {
    pairs.set(`${e.sourceCountry}:${e.targetCountry}`, {
      sourceCountry: e.sourceCountry,
      targetCountry: e.targetCountry,
    });
  }
  return blocDyadFloors({
    blocOf: (countryId) => blocOfAlignment(countryId, rows.get(countryId)),
    wars: snapshot.wars,
    embargoes: [...pairs.values()],
    nuclearCountries: snapshot.nuclearCountries,
  });
}
