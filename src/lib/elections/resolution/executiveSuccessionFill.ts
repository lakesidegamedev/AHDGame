/**
 * Fills a vacant national executive office once its acting period is over.
 *
 * A directly elected presidency gets a special presidential election. A
 * legislature or party vote is held by the largest bloc among the country's
 * autonomous legislators, who pick one of their own. Both run off the
 * succession timetable on the government document and stop when it is cleared.
 */

import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import type { CountryId } from "@/lib/constants/countries";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { getNppsCollection } from "@/lib/db/collections/npps";
import type { Election, ElectedOfficial, NPP, OfficeType } from "@/lib/db/types";
import type {
  ExecutiveSuccessionState,
  GovernmentFormation,
} from "@/lib/db/types/governmentFormation";
import { turnToWallClock } from "@/lib/elections/canonicalCycle";
import { getExecutiveOfficeKeys } from "@/lib/elections/executiveOffice";
import {
  pickSuccessor,
  seededRng,
  SUCCESSION_ELECTION_FILING_TURNS,
  SUCCESSION_ELECTION_GENERAL_TURNS,
  SUCCESSION_ELECTION_RETRY_COOLDOWN_TURNS,
  successionFillAction,
  type SuccessorCandidate,
} from "@/lib/elections/rules/successionFill";
import { vacateNonExecutiveOfficesForExecutive } from "@/lib/elections/vacateOfficesForExecutive";
import { processSuccessions } from "@/lib/elections/resolution/executiveSuccession";
import { logger } from "@/lib/observability/logger";
import { getSeatIdFromElection } from "@/lib/seats/seatId";

export const SPECIAL_PRESIDENT_ELECTION_TYPE = "special_president";

export interface SuccessionFillResult {
  spawned: number;
  voted: number;
}

interface DueFill {
  countryId: CountryId;
  succession: ExecutiveSuccessionState;
}

/** Russia's 1991 presidency runs on its own constitutional ballot machinery. */
function ownsPresidentialBallot(countryId: CountryId, preset: string | undefined): boolean {
  return countryId === "RU" && preset === "1991-default";
}

function buildSpecialPresidentElection(
  countryId: CountryId,
  currentTurn: number,
  now: Date
): Election {
  const primaryEndTurn = currentTurn + SUCCESSION_ELECTION_FILING_TURNS;
  const endTurn = primaryEndTurn + SUCCESSION_ELECTION_GENERAL_TURNS;
  return {
    _id: new ObjectId(),
    electionType: SPECIAL_PRESIDENT_ELECTION_TYPE,
    state: countryId,
    countryId,
    seatId: getSeatIdFromElection({
      countryId,
      electionType: SPECIAL_PRESIDENT_ELECTION_TYPE,
      state: countryId,
    }),
    cycle: currentTurn,
    status: "active",
    totalSeats: 1,
    startTurn: currentTurn,
    primaryEndTurn,
    endTurn,
    startTime: now,
    primaryEndTime: turnToWallClock(primaryEndTurn, now, currentTurn),
    endTime: turnToWallClock(endTurn, now, currentTurn),
    durationHours: SUCCESSION_ELECTION_FILING_TURNS + SUCCESSION_ELECTION_GENERAL_TURNS,
    primaryDurationHours: SUCCESSION_ELECTION_FILING_TURNS,
    createdAt: now,
    updatedAt: now,
  };
}

/** Countries that still need a special presidential election: none live and none recently resolved. */
async function spawnSpecialPresidentElections(
  db: Db,
  due: DueFill[],
  currentTurn: number,
  now: Date
): Promise<number> {
  if (due.length === 0) return 0;
  const elections = await getElectionsCollection(db);
  const countryIds = due.map((d) => d.countryId);
  const existing = await elections
    .find(
      {
        countryId: { $in: countryIds },
        electionType: { $in: ["president", SPECIAL_PRESIDENT_ELECTION_TYPE] },
        status: { $in: ["active", "upcoming", "completed"] },
      },
      { projection: { countryId: 1 } }
    )
    .toArray();
  const recent = await elections
    .find(
      {
        countryId: { $in: countryIds },
        electionType: SPECIAL_PRESIDENT_ELECTION_TYPE,
        status: "resolved",
        endTurn: { $gt: currentTurn - SUCCESSION_ELECTION_RETRY_COOLDOWN_TURNS },
      },
      { projection: { countryId: 1 } }
    )
    .toArray();
  const blocked = new Set([...existing, ...recent].map((e) => e.countryId));
  const docs = due
    .filter((d) => !blocked.has(d.countryId))
    .map((d) => buildSpecialPresidentElection(d.countryId, currentTurn, now));
  if (docs.length === 0) return 0;
  await elections.insertMany(docs.map((doc) => withCampaignRules(doc)));
  for (const doc of docs) {
    logger.info("Turn", `Special presidential election opened in ${doc.countryId}`);
  }
  return docs.length;
}

/** The largest bloc of autonomous legislators picks one of its own to fill each vacant office. */
async function holdSuccessionVotes(
  db: Db,
  due: DueFill[],
  currentTurn: number,
  now: Date
): Promise<number> {
  if (due.length === 0) return 0;
  const officials = await getElectedOfficialsCollection(db);
  const countryIds = due.map((d) => d.countryId);
  const offices = [...new Set(due.map((d) => d.succession.office))];
  const [rows, legislators] = await Promise.all([
    officials
      .find(
        { officeType: { $in: offices }, countryId: { $in: countryIds } },
        { projection: { officeType: 1, countryId: 1, characterId: 1, nppId: 1 } }
      )
      .toArray(),
    officials
      .find(
        {
          countryId: { $in: countryIds },
          nppId: { $ne: null },
          officeType: { $nin: [...getExecutiveOfficeKeys()] },
        },
        { projection: { countryId: 1, nppId: 1, party: 1 } }
      )
      .toArray(),
  ]);

  const officialOps: AnyBulkWriteOperation<ElectedOfficial>[] = [];
  const nppOps: AnyBulkWriteOperation<NPP>[] = [];
  const govOps: AnyBulkWriteOperation<GovernmentFormation>[] = [];
  const winners: ObjectId[] = [];
  for (const { countryId, succession } of due) {
    const row = rows.find((r) => r.officeType === succession.office && r.countryId === countryId);
    if (!row || row.characterId != null || row.nppId != null) continue;
    const seen = new Set<string>();
    const candidates: SuccessorCandidate[] = [];
    for (const l of legislators) {
      if (l.countryId !== countryId || !l.nppId || !l.party || seen.has(String(l.nppId))) continue;
      seen.add(String(l.nppId));
      candidates.push({ id: String(l.nppId), party: l.party });
    }
    const winner = pickSuccessor(
      candidates,
      seededRng(`${countryId}:${succession.office}:${succession.vacatedTurn}:${currentTurn}`)
    );
    if (!winner) continue;
    const nppId = new ObjectId(winner.id);
    officialOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            nppId,
            isNPP: true,
            party: winner.party,
            characterId: null,
            electedAt: now,
            updatedAt: now,
          },
        },
      },
    });
    nppOps.push({
      updateOne: {
        filter: { _id: nppId },
        update: {
          $set: { currentOffice: { type: succession.office } as OfficeType, updatedAt: now },
        },
      },
    });
    govOps.push({
      updateOne: { filter: { _id: countryId }, update: { $unset: { succession: "" } } },
    });
    winners.push(nppId);
    logger.info("Turn", `${succession.fill} seated a new ${succession.office} in ${countryId}`);
  }
  if (winners.length === 0) return 0;
  await officials.bulkWrite(officialOps, { ordered: false });
  await (await getNppsCollection(db)).bulkWrite(nppOps, { ordered: false });
  await getGovernmentFormationsCollection(db).bulkWrite(govOps, { ordered: false });
  for (const nppId of winners) {
    try {
      await vacateNonExecutiveOfficesForExecutive(db, { nppId }, now);
    } catch (err) {
      logger.error("Turn", "Succession vote could not vacate the winner's legislative seat", err);
    }
  }
  return winners.length;
}

export async function processSuccessionFills(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<SuccessionFillResult> {
  const result: SuccessionFillResult = { spawned: 0, voted: 0 };
  const open = await getGovernmentFormationsCollection(db)
    .find({ succession: { $type: "object" } }, { projection: { succession: 1 } })
    .toArray();
  const due = open
    .filter((g) => g.succession)
    .map((g) => ({
      countryId: g._id as CountryId,
      succession: g.succession as ExecutiveSuccessionState,
    }));
  const elections = due.filter(
    (d) => successionFillAction(d.succession, currentTurn) === "spawn_election"
  );
  const votes = due.filter((d) => successionFillAction(d.succession, currentTurn) === "hold_vote");
  if (elections.length === 0 && votes.length === 0) return result;

  const preset = await getGameStatePreset(db);
  result.spawned = await spawnSpecialPresidentElections(
    db,
    elections.filter((d) => !ownsPresidentialBallot(d.countryId, preset)),
    currentTurn,
    now
  );
  result.voted = await holdSuccessionVotes(db, votes, currentTurn, now);
  return result;
}

/** Every succession step in turn order: deputy promotion and timetables, then the fills they owe. */
export async function processSuccessionsAndFills(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<void> {
  await processSuccessions(db, currentTurn, now);
  await processSuccessionFills(db, currentTurn, now);
}
