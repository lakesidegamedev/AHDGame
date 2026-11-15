/**
 * Opens a fresh 2027 UK world with a few by-elections (see
 * `countries/uk/elections/yearOneByElections.ts`). On a scheduled calendar turn
 * it vacates one NPP-held, single-seat constituency row through the ordinary
 * vacancy shell, and the by-election watcher then fills it like any other
 * mid-term vacancy. Player-held seats are never touched.
 */
import type { Db } from "@/lib/mongodb";
import type { ElectedOfficial } from "@/lib/db/types";
import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getUkCommonsVacanciesCollection } from "@/lib/db/collections/ukByElection";
import { vacateCommonsSeat } from "@/lib/countries/uk/elections/commonsVacancyShell";
import {
  YEAR_ONE_BY_ELECTION_PRESET,
  pickYearOneSeat,
  yearOneEntryForTurn,
} from "@/lib/countries/uk/elections/yearOneByElections";
import { calendarTurn } from "@/lib/utils/gameDate";

export interface YearOneByElectionWorld {
  preset?: string;
  preIterationActive?: boolean;
  preIterationTurns?: number;
}

/** Returns true when a seat was vacated this turn. */
export async function processYearOneByElections(
  db: Db,
  currentTurn: number,
  now: Date,
  world: YearOneByElectionWorld
): Promise<boolean> {
  if (world.preset !== YEAR_ONE_BY_ELECTION_PRESET) return false;
  const entry = yearOneEntryForTurn(
    calendarTurn(currentTurn, {
      preIterationActive: world.preIterationActive,
      preIterationTurns: world.preIterationTurns,
    })
  );
  if (!entry) return false;

  // A retried turn must not vacate a second seat.
  const alreadyVacated = await getUkCommonsVacanciesCollection(db).findOne({
    countryId: "UK",
    vacatedTurn: currentTurn,
    reason: entry.reason,
  });
  if (alreadyVacated) return false;

  const officials = await getElectedOfficialsCollection(db);
  const rows = await officials
    .find({ officeType: "commons", ...officialsCountryScope("UK") })
    .toArray();
  const candidates = rows
    .filter(
      (o: ElectedOfficial) =>
        o.state && o.nppId != null && o.characterId == null && (o.seatsHeld ?? 1) === 1
    )
    .map((o) => ({ id: o._id.toString(), official: o }));
  const pick = pickYearOneSeat(candidates, entry.seatDraw);
  if (!pick) return false;

  await vacateCommonsSeat(db, pick.official, entry.reason, currentTurn, now);
  return true;
}
