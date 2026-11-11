/**
 * Commons by-election watcher, for every chamber in the Commons by-election
 * table (UK Commons, Canadian House of Commons).
 *
 * Fills Commons seats vacated mid-term (death, retirement, resignation,
 * defection, recall) with an off-calendar special race that contests ONLY the
 * vacated seats: the regional electorate scaled to
 * vacatedSeats / totalRegionSeats (see `byElectionCarve.ts`).
 *
 * Runs AFTER `byElectionWatcher` so governor specials settle first; both read
 * settled seat state. Suppressed during founding, when every seat is being
 * elected and there are no mid-term vacancies to backfill.
 *
 * Each special type lands in its own group in `cleanupDuplicateElections`, is
 * invisible to the perpetual spawner (which keys off the regular type), seats
 * winners in the chamber's regular office, and resolves additively (sitting MPs
 * keep their rows). A by-election only runs when it resolves before the
 * region's next general, and a snap dissolution cancels any live one, so a
 * special never seats into a delegation a general has already replaced.
 */

import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import type { ElectedOfficial, Election } from "@/lib/db/types";
import { officialsCountryScope } from "@/lib/db/electedOfficialScope";
import type { CountryId } from "@/lib/constants/countries";
import { getSeatIdFromElection } from "@/lib/seats/seatId";
import { turnToWallClock } from "@/lib/elections/canonicalCycle";
import { getUkCommonsSeats } from "@/lib/constants/states";
import { getGameStateCollection } from "@/lib/db/collections";
import { statesCollection } from "@/lib/db/repositories/states";
import {
  COMMONS_BY_ELECTION_CHAMBERS,
  SPECIAL_COMMONS_TYPES,
  commonsChamberForCountry,
  seatMapFromHouseDistricts,
  type CommonsByElectionChamber,
} from "@/lib/elections/rules/commonsByElectionChambers";
import { getUkCommonsVacanciesCollection } from "@/lib/db/collections/ukByElection";
import {
  COMMONS_BY_ELECTION_FILING_TURNS,
  COMMONS_BY_ELECTION_GENERAL_TURNS,
  COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS,
} from "@/lib/countries/uk/elections/commonsRecallRules";
import { computeByElectionCarveFraction } from "@/lib/countries/uk/elections/byElectionCarve";
import { regularRaceFillsSeatFirst } from "@/lib/turn/byElections";
import {
  claimVacanciesForElection,
  createCommonsVacancy,
  findLiveVacancyForOfficial,
  markVacanciesFilled,
} from "@/lib/countries/uk/elections/commonsVacancyShell";
import {
  advanceRecallPetition,
  ensureRecallWatch,
  evaluatePetitionTriggers,
  getActivePetitionForOfficial,
} from "@/lib/countries/uk/elections/recallPetitionShell";
import type { UkCommonsVacancy } from "@/lib/db/types/ukByElection";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { processYearOneByElections } from "./yearOneByElections";

export const SPECIAL_COMMONS_ELECTION_TYPE = "special_commons";

/** Election statuses that count as a live, seat-filling race. */
const LIVE_ELECTION_STATUSES: readonly Election["status"][] = ["active", "upcoming"];

/** Election statuses that count as a finished race for reconciliation. */
const FINISHED_ELECTION_STATUSES: readonly Election["status"][] = ["completed", "resolved"];

/** Turns a by-election takes from spawn to result. */
export const COMMONS_BY_ELECTION_TOTAL_TURNS =
  COMMONS_BY_ELECTION_FILING_TURNS + COMMONS_BY_ELECTION_GENERAL_TURNS;

/** Why a region with open vacancies does or does not get a by-election now. */
export type CommonsByElectionGate =
  | { kind: "spawn" }
  | { kind: "special_live" }
  | { kind: "general_fills"; endTurn: number | null }
  | { kind: "cooldown"; retryTurn: number };

/**
 * Spawn decision for one region, shared by the watcher and the vacancy read
 * model so the panel never promises a by-election the watcher will not run.
 *
 * - A live special is already filling the region's seats.
 * - A live general (regular or snap) suppresses only when it resolves before
 *   a by-election could. Regular races are `active` for their whole term, so
 *   counting any live general as cover would block every by-election.
 * - After a finished special the region waits out the retry cooldown, so an
 *   uncontested vacancy does not respawn a race every turn.
 */
export function commonsByElectionGate(input: {
  liveRaces: ReadonlyArray<Pick<Election, "electionType" | "endTurn">>;
  lastSpecialEndTurn: number | undefined;
  currentTurn: number;
}): CommonsByElectionGate {
  const { liveRaces, lastSpecialEndTurn, currentTurn } = input;
  if (liveRaces.some((e) => SPECIAL_COMMONS_TYPES.includes(e.electionType))) {
    return { kind: "special_live" };
  }
  const filling = liveRaces.filter((e) =>
    regularRaceFillsSeatFirst(e, currentTurn, COMMONS_BY_ELECTION_TOTAL_TURNS)
  );
  if (filling.length > 0) {
    const ends = filling.map((e) => e.endTurn).filter((t): t is number => typeof t === "number");
    return { kind: "general_fills", endTurn: ends.length > 0 ? Math.min(...ends) : null };
  }
  if (
    typeof lastSpecialEndTurn === "number" &&
    lastSpecialEndTurn > currentTurn - COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS
  ) {
    return {
      kind: "cooldown",
      retryTurn: lastSpecialEndTurn + COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS,
    };
  }
  return { kind: "spawn" };
}

export interface SpawnSpecialCommonsInput {
  /** Defaults to the UK Commons. */
  countryId?: CountryId;
  state: string;
  /** Open vacancy docs this race claims (one race may fill several). */
  vacancyIds: ObjectId[];
  /** Seats contested (sum of claimed vacancy seats). */
  seats: number;
  /** Regional Commons delegation size for the carve fraction. */
  totalRegionSeats: number;
  currentTurn: number;
  now: Date;
}

/**
 * Spawn one `special_commons` by-election for a region's claimed vacancies.
 * Persists the carve fraction and claimed vacancy ids on the race so tally
 * invariants and the UI can prove the scaled pool. Claims only `open`
 * vacancies, so a retried spawn with the same ids converges.
 */
export async function spawnSpecialCommons(
  db: Db,
  input: SpawnSpecialCommonsInput
): Promise<ObjectId> {
  const countryId = input.countryId ?? "UK";
  const chamber = commonsChamberForCountry(countryId);
  if (!chamber) throw new Error(`No Commons by-election chamber for ${countryId}`);
  const primaryEndTurn = input.currentTurn + COMMONS_BY_ELECTION_FILING_TURNS;
  const endTurn = primaryEndTurn + COMMONS_BY_ELECTION_GENERAL_TURNS;
  const carve = computeByElectionCarveFraction(input.seats, input.totalRegionSeats);
  const doc: Election = {
    _id: new ObjectId(),
    electionType: chamber.specialType,
    state: input.state,
    countryId,
    seatId: getSeatIdFromElection({
      countryId,
      electionType: chamber.specialType,
      state: input.state,
    }),
    cycle: input.currentTurn,
    status: "active",
    totalSeats: Math.max(1, Math.floor(input.seats)),
    startTurn: input.currentTurn,
    primaryEndTurn,
    endTurn,
    startTime: input.now,
    primaryEndTime: turnToWallClock(primaryEndTurn, input.now, input.currentTurn),
    endTime: turnToWallClock(endTurn, input.now, input.currentTurn),
    durationHours: COMMONS_BY_ELECTION_FILING_TURNS + COMMONS_BY_ELECTION_GENERAL_TURNS,
    primaryDurationHours: COMMONS_BY_ELECTION_FILING_TURNS,
    byElectionCarve: carve,
    byElectionVacancyIds: input.vacancyIds,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await (await getElectionsCollection(db)).insertOne(withCampaignRules(doc));
  await claimVacanciesForElection(db, input.vacancyIds, doc._id, input.currentTurn, input.now);
  return doc._id;
}

export interface CommonsWatcherResult {
  spawned: number;
  vacanciesEnsured: number;
  petitionsAdvanced: number;
  reconciled: number;
}

/**
 * Turn phase: backstop vacancies, advance the recall pipeline, reconcile
 * scheduled vacancies against finished races, and spawn by-elections for
 * open vacancies grouped per region.
 *
 * Every write is idempotent: vacancy creation dedupes per official row,
 * petition evaluation is guarded by lastEvaluatedTurn, claims only move
 * `open -> scheduled`, and spawn is suppressed by live races + cooldown —
 * so turn retries and simultaneous vacancies converge instead of doubling.
 */
export async function processCommonsByElectionWatcher(
  db: Db,
  currentTurn: number,
  now: Date
): Promise<CommonsWatcherResult> {
  const result: CommonsWatcherResult = {
    spawned: 0,
    vacanciesEnsured: 0,
    petitionsAdvanced: 0,
    reconciled: 0,
  };
  const gameState = await (await getGameStateCollection(db)).findOne({ _id: "current" });

  await processYearOneByElections(db, currentTurn, now, {
    preset: gameState?.preset,
    preIterationActive: gameState?.preIteration?.active,
    preIterationTurns: gameState?.preIterationTurns,
  });

  for (const chamber of COMMONS_BY_ELECTION_CHAMBERS) {
    await processChamberByElections(db, chamber, gameState?.preset, currentTurn, now, result);
  }

  if (result.spawned > 0) {
    console.log(`[Turn] Spawned ${result.spawned} Commons by-election(s)`);
  }
  return result;
}

/** Seats per region for one chamber, read only when a seat count must be derived. */
async function loadSeatMap(
  db: Db,
  chamber: CommonsByElectionChamber,
  preset: string | undefined
): Promise<Record<string, number>> {
  if (chamber.seatSource === "presetCommonsTable") return getUkCommonsSeats(preset);
  const regions = await statesCollection(db)
    .find({ countryId: chamber.countryId }, { projection: { _id: 1, houseDistricts: 1 } })
    .toArray();
  return seatMapFromHouseDistricts(regions);
}

async function processChamberByElections(
  db: Db,
  chamber: CommonsByElectionChamber,
  preset: string | undefined,
  currentTurn: number,
  now: Date,
  result: CommonsWatcherResult
): Promise<void> {
  const countryId = chamber.countryId;
  const scope = chamber.claimsUnscopedRows
    ? officialsCountryScope(countryId)
    : { countryId: chamber.countryId };
  const officials = await getElectedOfficialsCollection(db);
  const elections = await getElectionsCollection(db);
  const vacancies = getUkCommonsVacanciesCollection(db);
  const regularTypes = chamber.generalTypes as Election["electionType"][];
  let seatMap: Record<string, number> | null = null;
  const seatsFor = async () => (seatMap ??= await loadSeatMap(db, chamber, preset));

  // ── 1. Backstop: every holder-less seat row needs a live vacancy. ──
  // Death, bans, and admin removals tombstone the row without recording a
  // reason; hooked paths (retirement, resignation, recall) write a precise
  // reason instead, so this only fires for unhooked paths (`removal`).
  const commonsRows = await officials.find({ officeType: chamber.officeType, ...scope }).toArray();
  const tombstones = commonsRows.filter((o) => o.state && o.characterId == null && o.nppId == null);
  const untracked: ElectedOfficial[] = [];
  for (const row of tombstones) {
    if (!(await findLiveVacancyForOfficial(db, row._id))) untracked.push(row);
  }
  // Office-switch vacates unset `seatsHeld`, so a bloc row would be
  // re-contested as one seat and the rest of the bloc lost. Size count-less
  // rows from the region's deficit: preset seats minus seated MPs, seats live
  // vacancies already cover, and untracked rows that kept a count. Several
  // count-less rows in one region split it once: the first takes the deficit
  // less one seat per other row, the others one each. Never below one.
  const derivedSeats = new Map<string, number>();
  const countless = untracked.filter((row) => !((row.seatsHeld ?? 0) > 0));
  if (countless.length > 0) {
    const live = await vacancies
      .find({ countryId, status: { $in: ["open", "scheduled"] } })
      .toArray();
    const regionSeats = await seatsFor();
    for (const state of new Set(countless.map((row) => row.state as string))) {
      const rows = countless.filter((row) => row.state === state);
      const seated = commonsRows
        .filter((o) => o.state === state && (o.characterId != null || o.nppId != null))
        .reduce((n, o) => n + (o.seatsHeld ?? 1), 0);
      const claimed = live
        .filter((v) => v.state === state)
        .reduce((n, v) => n + Math.max(1, v.seats), 0);
      const kept = untracked
        .filter((row) => row.state === state && (row.seatsHeld ?? 0) > 0)
        .reduce((n, row) => n + (row.seatsHeld as number), 0);
      const deficit = (regionSeats[state] ?? 0) - seated - claimed - kept;
      rows.forEach((row, i) =>
        derivedSeats.set(row._id.toString(), i === 0 ? Math.max(1, deficit - (rows.length - 1)) : 1)
      );
    }
  }
  for (const row of untracked) {
    await createCommonsVacancy(db, {
      countryId,
      officialId: row._id,
      state: row.state as string,
      seats: derivedSeats.get(row._id.toString()) ?? Math.max(1, row.seatsHeld ?? 1),
      reason: "removal",
      priorCharacterName: row.characterName ?? undefined,
      priorParty: typeof row.party === "string" ? row.party : undefined,
      vacatedTurn: currentTurn,
      now,
    });
    result.vacanciesEnsured++;
  }

  // ── 2. Recall pipeline: ensure watches for seated MPs, evaluate triggers,
  // advance open/check petitions. Favorability + infamy load in one batch. ──
  const seated = chamber.recallPetitions
    ? commonsRows.filter((o) => o.state && (o.characterId != null || o.nppId != null))
    : [];
  const characterIds = seated.map((o) => o.characterId).filter((id): id is ObjectId => id != null);
  const characters =
    characterIds.length > 0
      ? await (
          await getCharactersCollection(db)
        )
          .find(
            { _id: { $in: characterIds } },
            { projection: { _id: 1, name: 1, party: 1, favorability: 1, infamy: 1 } }
          )
          .toArray()
      : [];
  const characterById = new Map(characters.map((c) => [c._id.toString(), c]));
  for (const row of seated) {
    if (row.characterId == null) continue;
    const character = characterById.get(row.characterId.toString());
    if (!character) continue;
    const petition =
      (await getActivePetitionForOfficial(db, row._id)) ??
      (await ensureRecallWatch(db, { official: row, target: character, currentTurn, now }));
    if (petition.status === "watch") {
      const { action } = await evaluatePetitionTriggers(
        db,
        petition,
        character.favorability ?? 50,
        character.infamy ?? 0,
        currentTurn,
        now
      );
      if (action !== "none") result.petitionsAdvanced++;
    } else {
      const { action } = await advanceRecallPetition(
        db,
        petition,
        currentTurn,
        character.favorability ?? 50,
        now
      );
      if (action !== "wait") result.petitionsAdvanced++;
    }
  }

  // ── 3. Reconcile scheduled vacancies against finished races. ──
  const liveVacancies = await vacancies
    .find({ countryId, status: { $in: ["open", "scheduled"] } })
    .toArray();
  const scheduled = liveVacancies.filter((v) => v.status === "scheduled" && v.electionId);
  const electionIds = [...new Set(scheduled.map((v) => v.electionId as ObjectId))];
  const scheduledElections =
    electionIds.length > 0 ? await elections.find({ _id: { $in: electionIds } }).toArray() : [];
  const electionById = new Map(scheduledElections.map((e) => [e._id.toString(), e]));
  const statesWithVacancies = [...new Set(liveVacancies.map((v) => v.state))];
  const finishedRegular =
    statesWithVacancies.length > 0
      ? await elections
          .find({
            countryId,
            state: { $in: statesWithVacancies },
            electionType: { $in: regularTypes },
            status: { $in: FINISHED_ELECTION_STATUSES },
          })
          .toArray()
      : [];
  const regularEndByState = new Map<string, number>();
  for (const e of finishedRegular) {
    if (typeof e.endTurn !== "number") continue;
    const prev = regularEndByState.get(e.state);
    if (prev === undefined || e.endTurn > prev) regularEndByState.set(e.state, e.endTurn);
  }
  const reopenIds: ObjectId[] = [];
  const subsumeIds: ObjectId[] = [];
  const filledByElection = new Map<string, UkCommonsVacancy[]>();
  for (const v of scheduled) {
    const race = electionById.get((v.electionId as ObjectId).toString());
    if (!race) {
      reopenIds.push(v._id);
      continue;
    }
    if (FINISHED_ELECTION_STATUSES.includes(race.status)) {
      const list = filledByElection.get(race._id.toString()) ?? [];
      list.push(v);
      filledByElection.set(race._id.toString(), list);
      continue;
    }
    if (race.status === "cancelled") {
      reopenIds.push(v._id);
      continue;
    }
    // A regular general/snap that resolved after this race was scheduled
    // re-elects the whole delegation: the vacancy is subsumed, not filled.
    const regularEnd = regularEndByState.get(v.state);
    if (
      typeof regularEnd === "number" &&
      typeof v.scheduledTurn === "number" &&
      regularEnd >= v.scheduledTurn
    ) {
      subsumeIds.push(v._id);
    }
  }
  // Open vacancies overtaken by a finished regular race are subsumed too —
  // but only when the race resolved after the seat went vacant.
  for (const v of liveVacancies) {
    if (v.status !== "open") continue;
    const regularEnd = regularEndByState.get(v.state);
    if (typeof regularEnd === "number" && regularEnd >= v.vacatedTurn) {
      subsumeIds.push(v._id);
    }
  }
  for (const [electionId] of filledByElection) {
    result.reconciled += await markVacanciesFilled(db, new ObjectId(electionId), currentTurn, now);
  }
  if (reopenIds.length > 0) {
    const reopened = await vacancies.updateMany(
      { _id: { $in: reopenIds }, status: "scheduled" },
      { $set: { status: "open", updatedAt: now }, $unset: { electionId: "", scheduledTurn: "" } }
    );
    result.reconciled += reopened.modifiedCount ?? 0;
  }
  if (subsumeIds.length > 0) {
    const subsumed = await vacancies.updateMany(
      { _id: { $in: subsumeIds }, status: { $in: ["open", "scheduled"] } },
      { $set: { status: "subsumed", resolvedTurn: currentTurn, updatedAt: now } }
    );
    result.reconciled += subsumed.modifiedCount ?? 0;
  }

  // ── 4. Spawn: one `special_commons` per region over its open vacancies. ──
  const openByState = new Map<string, UkCommonsVacancy[]>();
  const freshOpen = await vacancies.find({ countryId, status: "open" }).toArray();
  for (const v of freshOpen) {
    const list = openByState.get(v.state) ?? [];
    list.push(v);
    openByState.set(v.state, list);
  }
  if (openByState.size > 0) {
    const liveRaces = await elections
      .find({
        countryId,
        state: { $in: [...openByState.keys()] },
        electionType: {
          $in: [chamber.specialType, ...regularTypes],
        },
        status: { $in: LIVE_ELECTION_STATUSES },
      })
      .toArray();
    const liveByState = new Map<string, Election[]>();
    for (const e of liveRaces) {
      const list = liveByState.get(e.state) ?? [];
      list.push(e);
      liveByState.set(e.state, list);
    }
    const finishedSpecials = await elections
      .find({
        countryId,
        state: { $in: [...openByState.keys()] },
        electionType: chamber.specialType,
        status: { $nin: LIVE_ELECTION_STATUSES },
      })
      .toArray();
    const cooldownEndByState = new Map<string, number>();
    for (const e of finishedSpecials) {
      if (typeof e.endTurn !== "number") continue;
      const prev = cooldownEndByState.get(e.state);
      if (prev === undefined || e.endTurn > prev) cooldownEndByState.set(e.state, e.endTurn);
    }
    for (const [state, claims] of openByState) {
      const gate = commonsByElectionGate({
        liveRaces: liveByState.get(state) ?? [],
        lastSpecialEndTurn: cooldownEndByState.get(state),
        currentTurn,
      });
      if (gate.kind !== "spawn") continue;
      const seats = claims.reduce((n, v) => n + Math.max(1, v.seats), 0);
      const regionSeats = await seatsFor();
      await spawnSpecialCommons(db, {
        countryId,
        state,
        vacancyIds: claims.map((v) => v._id),
        seats,
        totalRegionSeats: regionSeats[state] ?? seats,
        currentTurn,
        now,
      });
      result.spawned++;
    }
  }
}
