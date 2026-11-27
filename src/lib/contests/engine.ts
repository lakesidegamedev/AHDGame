import { withSessionDb } from "@/lib/db/sessionDb";
import type { PlayerCharacter, ContestWorld } from "@/lib/contests/standings";
import {
  loadCorpRows,
  loadApprovals,
  loadPlayerHeads,
  loadParties,
  loadStateExecutives,
  loadStateApprovals,
  influenceOf,
  favorabilityOf,
  playerObjectIds,
  computeRawStandings,
  referralStandings,
} from "@/lib/contests/standings";
/**
 * Weekly contests, run after each turn commits: opens a round per kind with a
 * baseline snapshot, refreshes standings each turn, and when a round's week is
 * up pays the leader a cash prize and opens the next round (runContestsAfterTurn).
 */

import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import * as Sentry from "@sentry/nextjs";

import type {
  ContestBaseline,
  ContestKind,
  ContestRound,
  ContestStanding,
  ContestWinner,
} from "@/lib/db/types/contestRound";

import {
  CONTEST_KINDS,
  CONTEST_ROUND_MS,
  comebackEligible,
  lowerHalfIds,
  rookieEligible,
  contestRoundId,
  corpMinOpeningAnchor,
  pickPlacings,
  roundBelongsToEarlierWorld,
  roundIsDue,
  splitCorpTiers,
  wealthMinOpeningAnchor,
  iterationChanged,
  type CorpOpening,
} from "./rules";
import { reconcileContestAchievements } from "./achievements";
import { awardReferralContest } from "./referralAward";
import { payContestPrize } from "./prize";
import { loadCharacterNetWorths } from "./netWorth";
import { announceContestResults, type SettledRoundResult } from "./announce";
import { getContestRoundsCollection } from "./collection";

import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

import { usersCollection } from "@/lib/db/repositories/users";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";

const contestRounds = getContestRoundsCollection;

/** Live player characters whose accounts are not banned. */
async function loadPlayers(db: Db): Promise<Map<string, PlayerCharacter>> {
  const characters = await charactersCollection(db)
    .find(
      { isSynthetic: { $ne: true } },
      {
        projection: {
          _id: 1,
          userId: 1,
          name: 1,
          countryId: 1,
          nationalInfluence: 1,
          sequentialId: 1,
          favorability: 1,
          createdAt: 1,
        },
      }
    )
    .toArray();
  const userIds = characters.map((c) => c.userId).filter(Boolean);
  const users = await usersCollection(db)
    .find({ _id: { $in: userIds } }, { projection: { _id: 1, isBanned: 1, createdAt: 1 } })
    .toArray();
  const bannedIds = new Set(users.filter((u) => u.isBanned).map((u) => u._id.toString()));
  const accountCreatedAt = new Map(users.map((u) => [u._id.toString(), u.createdAt]));
  const players = new Map<string, PlayerCharacter>();
  for (const c of characters) {
    if (!c.userId || bannedIds.has(c.userId.toString())) continue;
    const created = accountCreatedAt.get(c.userId.toString());
    players.set(c._id.toString(), {
      ...(c as PlayerCharacter),
      ...(created ? { accountCreatedAt: new Date(created) } : {}),
    });
  }
  return players;
}

/**
 * Each player corporation's market cap about a week ago, in its own currency:
 * the latest snapshot written in the day before the one-week mark.
 */
async function loadWeekAgoCaps(
  db: Db,
  world: ContestWorld,
  corporationIds: string[]
): Promise<Map<string, number>> {
  const caps = new Map<string, number>();
  if (corporationIds.length === 0) return caps;
  const weekAgo = world.now.getTime() - CONTEST_ROUND_MS;
  const rows = await corporationHistoryCollection(db)
    .find(
      {
        corporationId: { $in: corporationIds.map((id) => new ObjectId(id)) },
        createdAt: { $gte: new Date(weekAgo - 24 * 60 * 60 * 1000), $lte: new Date(weekAgo) },
      },
      { projection: { corporationId: 1, marketCap: 1, createdAt: 1 } }
    )
    .sort({ createdAt: 1 })
    .toArray();
  // Ascending, so the last row seen per corporation is the one nearest the mark.
  for (const row of rows) {
    if (Number.isFinite(row.marketCap)) caps.set(row.corporationId.toString(), row.marketCap);
  }
  return caps;
}

// ── Opening a round ─────────────────────────────────────────────────────────

async function openingBaselines(
  db: Db,
  world: ContestWorld,
  kinds: ContestKind[]
): Promise<Map<ContestKind, { baselines: ContestBaseline[]; tierBoundaryAnchor?: number }>> {
  const out = new Map<ContestKind, { baselines: ContestBaseline[]; tierBoundaryAnchor?: number }>();

  if (kinds.includes("corp_growth_small") || kinds.includes("corp_growth_large")) {
    const corps = await loadCorpRows(db, world);
    const openings: CorpOpening[] = [...corps.values()].map((c) => ({
      corporationId: c.corporationId,
      characterId: c.ceoCharacterId,
      capLocal: c.capLocal,
      capAnchor: c.capAnchor,
    }));
    const split = splitCorpTiers(openings, corpMinOpeningAnchor(world.preset));
    const toBaseline = (o: CorpOpening): ContestBaseline => ({
      subjectId: o.corporationId,
      characterId: o.characterId,
      value: o.capLocal,
      injected: 0,
    });
    out.set("corp_growth_small", {
      baselines: split.small.map(toBaseline),
      tierBoundaryAnchor: split.boundaryAnchor,
    });
    out.set("corp_growth_large", {
      baselines: split.large.map(toBaseline),
      tierBoundaryAnchor: split.boundaryAnchor,
    });
  }

  if (kinds.includes("corp_comeback")) {
    const corps = await loadCorpRows(db, world);
    const weekAgo = await loadWeekAgoCaps(db, world, [...corps.keys()]);
    const floor = corpMinOpeningAnchor(world.preset);
    out.set("corp_comeback", {
      baselines: [...corps.values()]
        .filter(
          (c) =>
            c.capAnchor >= floor && comebackEligible(weekAgo.get(c.corporationId) ?? 0, c.capLocal)
        )
        .map((c) => ({
          subjectId: c.corporationId,
          characterId: c.ceoCharacterId,
          value: c.capLocal,
          injected: 0,
        })),
    });
  }

  const characterBaseline = (c: PlayerCharacter, value: number): ContestBaseline => ({
    subjectId: c._id.toString(),
    characterId: c._id.toString(),
    value,
  });
  const players = [...world.players.values()];

  if (kinds.includes("influence_gain")) {
    out.set("influence_gain", {
      baselines: players.map((c) => characterBaseline(c, influenceOf(c))),
    });
  }

  if (kinds.includes("rookie_influence")) {
    out.set("rookie_influence", {
      baselines: players
        .filter((c) => rookieEligible(c.accountCreatedAt?.getTime(), world.now.getTime()))
        .map((c) => characterBaseline(c, influenceOf(c))),
    });
  }

  if (kinds.includes("backbench_influence")) {
    const lower = lowerHalfIds(
      players.map((c) => ({ id: c._id.toString(), value: influenceOf(c) }))
    );
    out.set("backbench_influence", {
      baselines: players
        .filter((c) => lower.has(c._id.toString()))
        .map((c) => characterBaseline(c, influenceOf(c))),
    });
  }

  if (kinds.includes("favorability_gain")) {
    out.set("favorability_gain", {
      baselines: players.map((c) => characterBaseline(c, favorabilityOf(c))),
    });
  }

  if (kinds.includes("governor_approval")) {
    const executives = [...(await loadStateExecutives(db)).values()].filter(
      (e) => e.characterId && world.players.has(e.characterId)
    );
    const approvals = await loadStateApprovals(
      db,
      executives.map((e) => e.stateId)
    );
    out.set("governor_approval", {
      baselines: executives
        .filter((e) => approvals.has(e.stateId))
        .map((e) => ({
          subjectId: e.stateId,
          characterId: e.characterId!,
          value: approvals.get(e.stateId)!.approval,
        })),
    });
  }

  if (kinds.includes("approval_gain")) {
    const approvals = await loadApprovals(db);
    const heads = await loadPlayerHeads(db, world, [...approvals.keys()]);
    const baselines: ContestBaseline[] = [];
    for (const [countryId, approval] of approvals) {
      const head = heads.get(countryId);
      if (!head || !Number.isFinite(approval.approvalRating)) continue;
      baselines.push({ subjectId: countryId, characterId: head, value: approval.approvalRating });
    }
    out.set("approval_gain", { baselines });
  }

  if (kinds.includes("wealth_growth")) {
    const worths = await loadCharacterNetWorths(db, playerObjectIds(world));
    const floor = wealthMinOpeningAnchor(world.preset);
    out.set("wealth_growth", {
      baselines: [...worths]
        .filter(([, value]) => value >= floor)
        .map(([id, value]) => ({ subjectId: id, characterId: id, value, injected: 0 })),
    });
  }

  if (kinds.includes("party_growth")) {
    const parties = await loadParties(db);
    out.set("party_growth", {
      baselines: [...parties.values()]
        .filter((p) => p.chairId && world.players.has(p.chairId))
        .map((p) => ({ subjectId: p.partyId, characterId: p.chairId!, value: p.memberCount })),
    });
  }

  // Legislator, kingmaker and referral rounds count from the opening; there is no baseline.
  if (kinds.includes("legislator_bills")) out.set("legislator_bills", { baselines: [] });
  if (kinds.includes("kingmaker")) out.set("kingmaker", { baselines: [] });
  if (kinds.includes("referrals_weekly")) out.set("referrals_weekly", { baselines: [] });

  return out;
}

/**
 * End time for rounds opening now. A round opening while the other weekly
 * rounds have at least half a week left joins their week, so every contest
 * settles together and the results go out in one post; otherwise it runs a
 * full week. Rounds opened off-cycle (a new contest kind, a missed settlement)
 * fall into step within one round.
 */
async function sharedWeekEnd(db: Db, world: ContestWorld, opening: ContestKind[]): Promise<Date> {
  const fullWeek = new Date(world.now.getTime() + CONTEST_ROUND_MS);
  const others = await contestRounds(db)
    .find(
      {
        status: "active",
        kind: { $in: CONTEST_KINDS.filter((k) => !opening.includes(k)) },
        endsAt: { $gte: new Date(world.now.getTime() + CONTEST_ROUND_MS / 2) },
      },
      { projection: { endsAt: 1 } }
    )
    .toArray();
  const latest = Math.max(...others.map((r) => r.endsAt.getTime()));
  return Number.isFinite(latest) && latest <= fullWeek.getTime() ? new Date(latest) : fullWeek;
}

/** Rounds whose field is read from corporation history snapshots. */
const HISTORY_BASELINE_KINDS: ReadonlySet<ContestKind> = new Set([
  "corp_growth_small",
  "corp_growth_large",
  "corp_comeback",
]);

/**
 * A corporation round opened with no history snapshots (e.g. an economy-only
 * reset wipes them) has an empty field forever. Take baselines on the first
 * turn that has snapshots; growth counts from that turn.
 */
async function fillLateBaselines(
  db: Db,
  world: ContestWorld,
  round: ContestRound
): Promise<ContestRound> {
  const kind = round.kind as ContestKind;
  if (round.baselines.length > 0 || !HISTORY_BASELINE_KINDS.has(kind)) return round;
  const late = (await openingBaselines(db, world, [kind])).get(kind);
  if (!late || late.baselines.length === 0) return round;
  return {
    ...round,
    baselines: late.baselines,
    ...(late.tierBoundaryAnchor !== undefined
      ? { tierBoundaryAnchor: late.tierBoundaryAnchor }
      : {}),
  };
}

async function openRounds(db: Db, world: ContestWorld, kinds: ContestKind[]): Promise<number> {
  if (kinds.length === 0) return 0;
  // One shared weekly counter, so every contest opened in the same week carries
  // the same round number even when a contest joined later than the others.
  const last = await contestRounds(db)
    .find({ kind: { $in: CONTEST_KINDS } }, { projection: { kind: 1, roundNumber: 1 } })
    .toArray();
  const lastRoundNumber = Math.max(0, ...last.map((r) => r.roundNumber));

  const baselines = await openingBaselines(db, world, kinds);
  const endsAt = await sharedWeekEnd(db, world, kinds);
  let opened = 0;
  for (const kind of kinds) {
    const roundNumber = lastRoundNumber + 1;
    const opening = baselines.get(kind) ?? { baselines: [] };
    const round: ContestRound = {
      _id: contestRoundId(kind, roundNumber),
      kind,
      roundNumber,
      status: "active",
      startedAt: world.now,
      endsAt,
      startTurn: world.turn,
      ...(world.iterationKey ? { iterationKey: world.iterationKey } : {}),
      ...(opening.tierBoundaryAnchor !== undefined
        ? { tierBoundaryAnchor: opening.tierBoundaryAnchor }
        : {}),
      baselines: opening.baselines,
      standings: [],
      winners: [],
    };
    try {
      await contestRounds(db).insertOne(round);
      opened++;
    } catch (err) {
      // Duplicate id: another process opened this round first.
      if ((err as { code?: number }).code !== 11000) throw err;
      continue;
    }
    // Standings exist from the moment a round opens, so the field shows
    // straight away instead of an empty card until the next turn.
    const { standings } = await computeStandings(db, world, round);
    await contestRounds(db).updateOne(
      { _id: round._id, status: "active" },
      { $set: { standings, standingsTurn: world.turn, refreshedAt: world.now } }
    );
  }
  return opened;
}

// ── Standings ───────────────────────────────────────────────────────────────

async function computeStandings(
  db: Db,
  world: ContestWorld,
  round: ContestRound
): Promise<{ standings: ContestStanding[]; baselines: ContestBaseline[] }> {
  const result = await computeRawStandings(db, world, round);
  return {
    ...result,
    standings: result.standings.map((entry) => ({
      ...entry,
      userId: world.players.get(entry.characterId)?.userId.toString(),
    })),
  };
}

// ── Settlement ──────────────────────────────────────────────────────────────

export async function settleContestRound(
  db: Db,
  world: ContestWorld,
  round: ContestRound
): Promise<SettledRoundResult | null> {
  return withSessionDb(db, async (db) => {
    const current = await contestRounds(db).findOne({ _id: round._id, status: "active" });
    if (!current) return null;
    return settleRoundWork(db, world, current);
  });
}

async function settleRoundWork(
  db: Db,
  world: ContestWorld,
  round: ContestRound
): Promise<SettledRoundResult | null> {
  const { standings, baselines } = await computeStandings(db, world, round);
  const kind = round.kind as ContestKind;
  const winners: ContestWinner[] = pickPlacings(kind, standings).map((s, i) => ({
    rank: i + 1,
    userId: s.userId,
    characterId: s.characterId,
    characterName: s.characterName,
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    score: s.score,
  }));

  // The status flip is the claim: only the process that moves the round out
  // of "active" pays, so a prize can never be paid twice.
  const claim = await contestRounds(db).updateOne(
    { _id: round._id, status: "active" },
    {
      $set: {
        status: "settled",
        settledAt: world.now,
        settledTurn: world.turn,
        standings,
        baselines,
        standingsTurn: world.turn,
        refreshedAt: world.now,
        winners,
      },
    }
  );
  if (claim.modifiedCount !== 1) return null;

  for (const [i, winner] of winners.entries()) {
    const character = world.players.get(winner.characterId);
    if (!character) continue;
    const paid = await payContestPrize(db, {
      character,
      round: { _id: round._id, kind, roundNumber: round.roundNumber },
      subjectName: winner.subjectName,
      place: i + 1,
      turn: world.turn,
      preset: world.preset,
      now: world.now,
    });
    if (!paid.credited) throw new Error("Contest winner unavailable during prize settlement");
    await contestRounds(db).updateOne(
      { _id: round._id },
      {
        $set: {
          [`winners.${i}.prizeAnchor`]: paid.anchorAmount,
          [`winners.${i}.prizeLocal`]: paid.localAmount,
          [`winners.${i}.currencyCode`]: paid.currencyCode,
          ...(paid.credited ? { [`winners.${i}.paidAt`]: world.now } : {}),
        },
      }
    );
    winners[i] = { ...winner, prizeAnchor: paid.anchorAmount };
  }
  return { kind, roundNumber: round.roundNumber, standings, winners };
}

// ── Iteration referral contest ──────────────────────────────────────────────

const ITERATION_KIND = "referrals_iteration" as const;

async function openIterationRound(db: Db, world: ContestWorld, startedAt: Date): Promise<void> {
  try {
    await withSessionDb(db, async (db) => {
      if (await contestRounds(db).findOne({ kind: ITERATION_KIND, status: "active" })) return;
      const last = await contestRounds(db)
        .find({ kind: ITERATION_KIND }, { projection: { roundNumber: 1 } })
        .sort({ roundNumber: -1 })
        .limit(1)
        .toArray();
      const roundNumber = (last[0]?.roundNumber ?? 0) + 1;
      await contestRounds(db).insertOne({
        _id: contestRoundId(ITERATION_KIND, roundNumber),
        kind: ITERATION_KIND,
        roundNumber,
        status: "active",
        startedAt,
        endsAt: startedAt,
        startTurn: world.turn,
        ...(world.iterationKey ? { iterationKey: world.iterationKey } : {}),
        baselines: [],
        standings: await referralStandings(db, world.playersByUser, startedAt),
        refreshedAt: world.now,
        winners: [],
      });
    });
  } catch (error) {
    if (
      (error as { code?: number }).code !== 11000 ||
      !(await contestRounds(db).findOne({ kind: ITERATION_KIND, status: "active" }))
    )
      throw error;
  }
}

/**
 * Keep the iteration referral contest current. It counts from the moment the
 * world started, refreshes its standings every run, and when the world reports
 * a new iteration it awards the standings stored before the reset (the old
 * world's characters are retired by then) and opens the next contest from the
 * new world's start.
 */
async function runIterationReferrals(
  db: Db,
  world: ContestWorld
): Promise<"opened" | "awarded" | "running"> {
  const worldStart = world.epochStartedAt ?? world.now;
  const active = await contestRounds(db).findOne({ kind: ITERATION_KIND, status: "active" });

  if (!active) {
    await openIterationRound(db, world, worldStart);
    return "opened";
  }

  if (iterationChanged(active.iterationKey, world.iterationKey)) {
    await awardReferralContest(db, {
      awardedBy: "system",
      now: world.now,
      roundId: active._id,
      turn: world.turn,
    });
    await openIterationRound(db, world, worldStart);
    return "awarded";
  }

  // A contest never starts before its world: a window carried over from an
  // older world is moved up to this world's start.
  const startedAt =
    world.epochStartedAt && active.startedAt < world.epochStartedAt
      ? world.epochStartedAt
      : active.startedAt;
  await contestRounds(db).updateOne(
    { _id: active._id, status: "active" },
    {
      $set: {
        startedAt,
        ...(!active.iterationKey && world.iterationKey ? { iterationKey: world.iterationKey } : {}),
        standings: await referralStandings(db, world.playersByUser, startedAt),
        refreshedAt: world.now,
      },
    }
  );
  return "running";
}

/**
 * Staff override: award the iteration referral contest now on fresh
 * standings, then start the next one from this moment.
 */
export async function awardIterationReferralsNow(db: Db, awardedBy: string, now = new Date()) {
  const [gameState, players] = await Promise.all([
    gameStateCollection(db).findOne({ _id: "current" } as never, {
      projection: { iteration: 1, currentTurn: 1 },
    }),
    loadPlayers(db),
  ]);
  const world: ContestWorld = {
    turn: gameState?.currentTurn ?? 0,
    now,
    preset: undefined,
    iterationKey: gameState?.iteration
      ? `${gameState.iteration.type}:${gameState.iteration.number}`
      : undefined,
    epochStartedAt: undefined,
    players,
    playersByUser: new Map([...players.values()].map((c) => [c.userId.toString(), c])),
  };
  const active = await contestRounds(db).findOne({ kind: ITERATION_KIND, status: "active" });
  if (active) {
    await contestRounds(db).updateOne(
      { _id: active._id, status: "active" },
      {
        $set: {
          standings: await referralStandings(db, world.playersByUser, active.startedAt),
          refreshedAt: now,
        },
      }
    );
  }
  const result = await awardReferralContest(db, { awardedBy, now });
  await openIterationRound(db, world, now);
  return result;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export interface ContestRunSummary {
  settled: number;
  voided: number;
  refreshed: number;
  opened: number;
  referrals?: "opened" | "awarded" | "running" | "failed";
}

declare global {
  var _ahdContestsRunning: boolean | undefined;
  var _ahdContestsOpenCheckedAt: number | undefined;
}

/**
 * Settle due rounds, refresh live standings, and open a round for every kind
 * without one. Safe to call concurrently: round ids are deterministic and
 * settlement claims each round with a conditional status flip.
 */
export async function runContests(
  db: Db,
  turn: number,
  now: Date = new Date()
): Promise<ContestRunSummary> {
  const summary: ContestRunSummary = { settled: 0, voided: 0, refreshed: 0, opened: 0 };
  const [gameState, players] = await Promise.all([
    gameStateCollection(db).findOne({ _id: "current" } as never, {
      projection: { preset: 1, iteration: 1, worldEpochStartedAt: 1 },
    }),
    loadPlayers(db),
  ]);
  const world: ContestWorld = {
    turn,
    now,
    preset: gameState?.preset,
    iterationKey: gameState?.iteration
      ? `${gameState.iteration.type}:${gameState.iteration.number}`
      : undefined,
    epochStartedAt: gameState?.worldEpochStartedAt ?? undefined,
    players,
    playersByUser: new Map([...players.values()].map((c) => [c.userId.toString(), c])),
  };

  const active = await contestRounds(db)
    .find({ status: "active", kind: { $in: [...CONTEST_KINDS] } })
    .toArray();

  const stillActive = new Set<string>();
  const settled: SettledRoundResult[] = [];
  for (const round of active) {
    const otherIteration =
      !!round.iterationKey && !!world.iterationKey && round.iterationKey !== world.iterationKey;
    if (otherIteration || roundBelongsToEarlierWorld(round.startTurn, turn)) {
      const res = await contestRounds(db).updateOne(
        { _id: round._id, status: "active" },
        { $set: { status: "void", settledAt: now, settledTurn: turn } }
      );
      summary.voided += res.modifiedCount;
      continue;
    }
    if (roundIsDue(round.endsAt.getTime(), now.getTime())) {
      const result = await settleContestRound(db, world, round);
      if (result) {
        summary.settled++;
        settled.push(result);
      }
      continue;
    }
    const live = await fillLateBaselines(db, world, round);
    const { standings, baselines } = await computeStandings(db, world, live);
    await contestRounds(db).updateOne(
      { _id: round._id, status: "active" },
      {
        $set: {
          standings,
          baselines,
          ...(live.tierBoundaryAnchor !== undefined
            ? { tierBoundaryAnchor: live.tierBoundaryAnchor }
            : {}),
          standingsTurn: turn,
          refreshedAt: now,
        },
      }
    );
    stillActive.add(round.kind);
    summary.refreshed++;
  }

  await announceContestResults(
    settled,
    new Map([...players.values()].map((c) => [c._id.toString(), c.userId]))
  );

  const missing = CONTEST_KINDS.filter((k) => !stillActive.has(k));
  summary.opened = await openRounds(db, world, missing);
  // The iteration referral award is separate state: its failure must not
  // stop the weekly rounds, which have already been written.
  try {
    summary.referrals = await runIterationReferrals(db, world);
  } catch (err) {
    summary.referrals = "failed";
    Sentry.captureException(err, { tags: { area: "contests", step: "iterationReferrals" } });
    console.error("[contests] iteration referral step failed", err);
  }
  try {
    await reconcileContestAchievements(db);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "contests", step: "achievements" } });
  }
  return summary;
}

/** Post-turn hook. Never throws and never overlaps itself within a process. */
export async function runContestsAfterTurn(db: Db, turn: number): Promise<void> {
  if (globalThis._ahdContestsRunning) return;
  globalThis._ahdContestsRunning = true;
  try {
    const summary = await runContests(db, turn);
    if (summary.settled || summary.opened || summary.voided || summary.referrals === "awarded") {
      console.log(
        `[contests] turn ${turn}: settled ${summary.settled}, opened ${summary.opened}, voided ${summary.voided}, referrals ${summary.referrals}`
      );
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "contests" } });
    console.error("[contests] post-turn run failed", err);
  } finally {
    globalThis._ahdContestsRunning = false;
  }
}

/** How often one process may check for missing rounds from a page view. */
const OPEN_CHECK_INTERVAL_MS = 60_000;

/**
 * Open any missing weekly rounds without waiting for a turn: called from the
 * Contests page so a fresh deploy or a reset world has live contests on the
 * first visit. Throttled per process, never throws, and shares the turn hook's
 * in-process guard; round ids keep it safe against the turn worker.
 */
export async function ensureContestsOpen(db: Db, now: Date = new Date()): Promise<void> {
  const last = globalThis._ahdContestsOpenCheckedAt ?? 0;
  if (now.getTime() - last < OPEN_CHECK_INTERVAL_MS) return;
  globalThis._ahdContestsOpenCheckedAt = now.getTime();
  if (globalThis._ahdContestsRunning) return;
  globalThis._ahdContestsRunning = true;
  try {
    const active = await contestRounds(db).countDocuments({
      status: "active",
      kind: { $in: [...CONTEST_KINDS] },
    });
    if (active >= CONTEST_KINDS.length) return;
    const gameState = await gameStateCollection(db).findOne({ _id: "current" } as never, {
      projection: { currentTurn: 1 },
    });
    await runContests(db, gameState?.currentTurn ?? 0, now);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "contests", step: "ensureOpen" } });
    console.error("[contests] opening rounds from the page failed", err);
  } finally {
    globalThis._ahdContestsRunning = false;
  }
}
