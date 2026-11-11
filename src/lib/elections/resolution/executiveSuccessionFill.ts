/**
 * Fills a vacant national executive office once its acting period is over.
 *
 * A directly elected presidency gets a special presidential election. A
 * legislature or party vote is held by the largest bloc among the country's
 * autonomous legislators, who pick one of their own. Both run off the
 * succession timetable on the government document and stop when it is cleared.
 *
 * Offices always fill. A vote with no autonomous legislator to pick seats a
 * generated member of the largest bloc once the fill is overdue, and an overdue
 * election-filled office with no special election running is filled the same way.
 */

import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import type { CountryId } from "@/lib/constants/countries";
import { getCountryLeaderStatesCollection } from "@/lib/db/collections/countryLeaderState";
import { getCountryStateCollection } from "@/lib/db/collections/countryState";
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
  mayGenerateSuccessor,
  needsForcedFill,
  ownsPresidentialBallot,
  pickFallbackParty,
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
import { processPresidentialSuccession } from "@/lib/turn/presidentialSuccession";
import { isLiveWorldSwitchOn } from "@/lib/gameConfig/liveWorldSwitches";
import { buildNewLeaderState } from "@/lib/turn/rulingPartyConfidence";
import type { CountryLeaderState } from "@/lib/db/types/countryLeaderState";
import { logger } from "@/lib/observability/logger";
import { getSeatIdFromElection } from "@/lib/seats/seatId";
import { getPoliticalPartiesCollection } from "@/lib/db/collections/politicalParties";
import { openNppCreationBatch } from "@/lib/npp/generator";
import { postSuccessionNews } from "@/lib/elections/resolution/successionNews";

export const SPECIAL_PRESIDENT_ELECTION_TYPE = "special_president";

export interface SuccessionFillResult {
  spawned: number;
  voted: number;
}

interface DueFill {
  countryId: CountryId;
  succession: ExecutiveSuccessionState;
}

interface SpawnResult {
  spawned: number;
  /** Countries with a special election running (called now or earlier). */
  live: Set<string>;
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
): Promise<SpawnResult> {
  const live = new Set<string>();
  if (due.length === 0) return { spawned: 0, live };
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
  for (const e of existing) live.add(String(e.countryId));
  const blocked = new Set([...existing, ...recent].map((e) => e.countryId));
  const docs = due
    .filter((d) => !blocked.has(d.countryId))
    .map((d) => buildSpecialPresidentElection(d.countryId, currentTurn, now));
  if (docs.length === 0) return { spawned: 0, live };
  await elections.insertMany(docs.map((doc) => withCampaignRules(doc)));
  for (const doc of docs) {
    live.add(String(doc.countryId));
    logger.info("Turn", `Special presidential election opened in ${doc.countryId}`);
    await postSuccessionNews(doc.countryId as CountryId, {
      event: "election_opened",
      office: "president",
      filingTurns: SUCCESSION_ELECTION_FILING_TURNS,
    });
  }
  return { spawned: docs.length, live };
}

/** Countries among `countryIds` whose own presidential ballot has already produced a result. */
async function countriesWithResolvedPresidentialBallot(
  db: Db,
  countryIds: string[]
): Promise<Set<string>> {
  if (countryIds.length === 0) return new Set();
  const rows = await (
    await getElectionsCollection(db)
  )
    .find(
      {
        countryId: { $in: countryIds as CountryId[] },
        electionType: "president",
        status: "resolved",
      },
      { projection: { countryId: 1 } }
    )
    .toArray();
  return new Set(rows.map((r) => String(r.countryId)));
}

/** The largest bloc of autonomous legislators picks one of its own to fill each vacant office. */
async function holdSuccessionVotes(
  db: Db,
  due: DueFill[],
  currentTurn: number,
  now: Date
): Promise<number> {
  if (due.length === 0) return 0;
  const nppBatch = openNppCreationBatch(db, new Map());
  try {
    return await holdSuccessionVotesWith(db, nppBatch, due, currentTurn, now);
  } finally {
    await nppBatch.close();
  }
}

async function holdSuccessionVotesWith(
  db: Db,
  nppBatch: ReturnType<typeof openNppCreationBatch>,
  due: DueFill[],
  currentTurn: number,
  now: Date
): Promise<number> {
  const officials = await getElectedOfficialsCollection(db);
  const countryIds = due.map((d) => d.countryId);
  const offices = [...new Set(due.map((d) => d.succession.office))];
  const confidenceCountryIds = due
    .filter((d) => d.succession.fill === "party_vote")
    .map((d) => d.countryId);
  const [rows, legislators, allLegislators, defaultParties, confidenceStates] = await Promise.all([
    officials
      .find(
        { officeType: { $in: offices }, countryId: { $in: countryIds } },
        { projection: { officeType: 1, countryId: 1, characterId: 1, nppId: 1, party: 1 } }
      )
      .toArray(),
    officials
      .find(
        {
          countryId: { $in: countryIds },
          nppId: { $ne: null },
          officeType: { $nin: [...getExecutiveOfficeKeys()] },
        },
        { projection: { countryId: 1, nppId: 1, characterId: 1, characterName: 1, party: 1 } }
      )
      .toArray(),
    // Players count toward the fallback party even though they never win a vote.
    officials
      .find(
        {
          countryId: { $in: countryIds },
          party: { $exists: true },
          officeType: { $nin: [...getExecutiveOfficeKeys()] },
        },
        { projection: { countryId: 1, party: 1 } }
      )
      .toArray(),
    (await getPoliticalPartiesCollection(db))
      .find(
        {
          countryId: { $in: countryIds },
          isDefunct: { $ne: true },
          regimeStatus: { $ne: "banned" },
        },
        { projection: { countryId: 1, sequentialId: 1, isDefault: 1 } }
      )
      .toArray(),
    confidenceCountryIds.length === 0
      ? Promise.resolve([])
      : getCountryStateCollection(db)
          .find(
            { _id: { $in: confidenceCountryIds }, hasLeaderConfidenceModel: true },
            { projection: { _id: 1 } }
          )
          .toArray(),
  ]);
  const hasConfidenceModel = new Set<string>(confidenceStates.map((c) => String(c._id)));

  const officialOps: AnyBulkWriteOperation<ElectedOfficial>[] = [];
  const nppOps: AnyBulkWriteOperation<NPP>[] = [];
  const govOps: AnyBulkWriteOperation<GovernmentFormation>[] = [];
  const leaderOps: AnyBulkWriteOperation<CountryLeaderState>[] = [];
  const leaderOpByNpp = new Map<string, AnyBulkWriteOperation<CountryLeaderState>>();
  const rowIds: ObjectId[] = [];
  const winners: ObjectId[] = [];
  const seated: Array<{ countryId: CountryId; office: string; name: string }> = [];
  for (const { countryId, succession } of due) {
    const row = rows.find((r) => r.officeType === succession.office && r.countryId === countryId);
    if (!row || row.characterId != null || row.nppId != null) continue;
    const seen = new Set<string>();
    const names = new Map<string, string>();
    const candidates: SuccessorCandidate[] = [];
    for (const l of legislators) {
      // Only autonomous politicians are ever picked; a player never wins a vote.
      if (l.countryId !== countryId || !l.nppId || l.characterId != null) continue;
      if (!l.party || seen.has(String(l.nppId))) continue;
      seen.add(String(l.nppId));
      names.set(String(l.nppId), l.characterName ?? "");
      candidates.push({ id: String(l.nppId), party: l.party });
    }
    let winner = pickSuccessor(
      candidates,
      seededRng(`${countryId}:${succession.office}:${succession.vacatedTurn}:${currentTurn}`)
    );
    if (!winner && mayGenerateSuccessor(succession, currentTurn)) {
      // Nobody autonomous can be picked and the deadline has passed: generate a
      // member of the largest bloc so the office is never left empty.
      const party = pickFallbackParty(
        allLegislators
          .filter((l) => l.countryId === countryId && l.party)
          .map((l) => String(l.party)),
        row.party,
        defaultParties
          .filter((p) => p.countryId === countryId)
          .sort(
            (a, b) =>
              Number(!!b.isDefault) - Number(!!a.isDefault) || a.sequentialId - b.sequentialId
          )
          .map((p) => String(p.sequentialId))
      );
      if (party) {
        const generated = await nppBatch.create({
          // No region: the batch homes the NPP in a region the party holds.
          // A country code here is never in the party's frontier and would
          // turn the successor independent.
          state: "",
          party,
          countryId,
          quality: 0,
        });
        names.set(String(generated._id), generated.name);
        winner = { id: String(generated._id), party: generated.party };
        logger.warn(
          "Turn",
          `Generated a ${succession.office} for ${countryId}: no one to vote for`
        );
      }
    }
    if (!winner) continue;
    const nppId = new ObjectId(winner.id);
    // The seat keeps the holder's name for the public API and wiki, so the
    // successor's name replaces the predecessor's rather than inheriting it.
    const winnerName = names.get(winner.id) ?? "";
    officialOps.push({
      updateOne: {
        filter: { _id: row._id, characterId: null, nppId: null },
        update: {
          $set: {
            nppId,
            isNPP: true,
            party: winner.party,
            characterId: null,
            electedAt: now,
            updatedAt: now,
            ...(winnerName ? { characterName: winnerName } : {}),
          },
          ...(winnerName ? {} : { $unset: { characterName: "" } }),
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
    const installsLeader = hasConfidenceModel.has(countryId);
    govOps.push({
      updateOne: {
        filter: { _id: countryId },
        update: {
          $unset: { succession: "" },
          ...(installsLeader
            ? { $set: { pmNppId: nppId, pmCharacterId: null, pmName: winnerName } }
            : {}),
        },
      },
    });
    if (installsLeader) {
      const state = buildNewLeaderState(
        countryId,
        { kind: "npp", id: nppId },
        succession.office,
        winner.party,
        currentTurn,
        now
      );
      leaderOpByNpp.set(String(nppId), {
        replaceOne: { filter: { _id: state._id }, replacement: state, upsert: true },
      });
    }
    rowIds.push(row._id);
    winners.push(nppId);
    seated.push({ countryId, office: succession.office, name: names.get(winner.id) ?? "" });
    logger.info("Turn", `${succession.fill} seated a new ${succession.office} in ${countryId}`);
  }
  if (winners.length === 0) return 0;
  const written = await officials.bulkWrite(officialOps, { ordered: false });
  // The write is guarded on the row still being vacant. If a concurrent
  // seating beat us to a row, drop that seat's follow-up writes and news.
  let landed = winners.map(String);
  if (typeof written?.matchedCount === "number" && written.matchedCount < officialOps.length) {
    const held = await officials
      .find({ _id: { $in: rowIds }, nppId: { $in: winners } }, { projection: { nppId: 1 } })
      .toArray();
    landed = held.map((r) => String(r.nppId));
  }
  const keep = (i: number) => landed.includes(String(winners[i]));
  const keptWinners = winners.filter((_, i) => keep(i));
  if (keptWinners.length === 0) return 0;
  await (
    await getNppsCollection(db)
  ).bulkWrite(
    nppOps.filter((_, i) => keep(i)),
    { ordered: false }
  );
  await getGovernmentFormationsCollection(db).bulkWrite(
    govOps.filter((_, i) => keep(i)),
    { ordered: false }
  );
  for (const id of keptWinners) {
    const op = leaderOpByNpp.get(String(id));
    if (op) leaderOps.push(op);
  }
  if (leaderOps.length > 0) {
    await getCountryLeaderStatesCollection(db).bulkWrite(leaderOps, { ordered: false });
  }
  for (const nppId of keptWinners) {
    try {
      await vacateNonExecutiveOfficesForExecutive(db, { nppId }, now);
    } catch (err) {
      logger.error("Turn", "Succession vote could not vacate the winner's legislative seat", err);
    }
  }
  for (const s of seated.filter((_, i) => keep(i))) {
    await postSuccessionNews(s.countryId, {
      event: "seated",
      office: s.office,
      ...(s.name ? { holderName: s.name } : {}),
    });
  }
  return keptWinners.length;
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
  // A country with its own presidential ballot is left to it only until that
  // ballot has produced a result; a later mid-term vacancy has no other opener.
  const ownBallot = elections.filter((d) => ownsPresidentialBallot(d.countryId, preset));
  const settled = await countriesWithResolvedPresidentialBallot(
    db,
    ownBallot.map((d) => d.countryId)
  );
  const callable = elections.filter(
    (d) => !ownsPresidentialBallot(d.countryId, preset) || settled.has(d.countryId)
  );
  const spawn = await spawnSpecialPresidentElections(db, callable, currentTurn, now);
  result.spawned = spawn.spawned;
  // An overdue vacancy whose special election is not running is filled by a vote.
  const forced = callable.filter((d) =>
    needsForcedFill(d.succession, currentTurn, spawn.live.has(d.countryId))
  );
  result.voted = await holdSuccessionVotes(db, [...votes, ...forced], currentTurn, now);
  return result;
}

/** Every succession step in turn order: deputy promotion and timetables, then the fills they owe. */
export async function processSuccessionsAndFills(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<void> {
  if (!(await isLiveWorldSwitchOn(db, "executiveSuccessionEnabled"))) {
    // A world seeded before the succession watcher keeps the US
    // President-to-VP succession it always had.
    await processPresidentialSuccession(db);
    return;
  }
  await processSuccessions(db, currentTurn, now);
  await processSuccessionFills(db, currentTurn, now);
}
