import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import type { Election, GameState } from "@/lib/db/types";
import { getUkCommonsSeats } from "@/lib/constants/states";
import { loadApportionment } from "@/lib/elections/apportionment";
import { getSeatIdFromElection } from "@/lib/seats";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { pickNextCanonicalCycle, turnToWallClock } from "@/lib/elections/canonicalCycle";
import {
  cycleAnchorContextFromGameState,
  type CycleAnchorContext,
} from "@/lib/elections/cycleAnchorContext";
import { electionToLarpYear } from "@/lib/utils/formatters";
import { planNextLowerChamberCycle } from "@/lib/elections/snapShift";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * Convert a prior endTime to a LARP turn number, anchored on `nowRef`'s
 * currentTurn. 1 turn = 1 real hour.
 */
function endTimeToLarpTurn(endTime: Date, nowRef: Date, currentTurn: number): number {
  const MS_PER_HOUR = 3_600_000;
  const turnsAgo = Math.round((nowRef.getTime() - new Date(endTime).getTime()) / MS_PER_HOUR);
  return currentTurn - turnsAgo;
}

type Db = Awaited<ReturnType<typeof import("@/lib/mongodb").getDb>>;

async function getCurrentTurnAndCtx(
  db: Db
): Promise<{ currentTurn: number; currentYear: number | undefined; ctx: CycleAnchorContext }> {
  const gs = await gameStateCollection(db).findOne({ _id: "current" });
  return {
    currentTurn: gs?.currentTurn ?? 1,
    // Needed by `loadApportionment` so a state admitted mid-game stays in the
    // seats map — without it the admitted set is built as of the preset year.
    currentYear: gs?.currentYear,
    ctx: cycleAnchorContextFromGameState(gs),
  };
}

/*
 * True while the pre-iteration founding phase is running.
 *
 * These spawners run from generalResolution when a race resolves and are not
 * suppressed by turnPhaseRegistry during the founding phase. Without the
 * guard, a resolving founding race would spawn another cycle 0, so the phase
 * never ends and later races get founding-length terms instead of real ones.
 * Skipping here is correct: the suppressed ensurePerpetualElections battery
 * spawns the real next cycle on the following turn with the offset stamped.
 */
function foundingPhaseActive(ctx: CycleAnchorContext): boolean {
  return ctx.preIterationActive === true;
}

/**
 * Spawn the next House election on the canonical LARP schedule. Called from
 * `generalResolution` immediately after a House cycle resolves — canonical
 * anchoring keeps admin-accelerated cycles from dragging the calendar.
 *
 * In the normal cadence (cycle N ended exactly at its canonical endTurn), the
 * new cycle's canonical startTurn ≤ currentTurn and the election spawns as
 * "active" with startTime just in the past. When admin fast-forwarded cycle N
 * to resolve early, the new cycle's canonical startTurn is in the future and
 * the election spawns as "upcoming" — advanceElectionTimers will flip it to
 * "active" once the canonical window opens.
 */
export async function spawnHouseElection(db: Db, fromElection: Election, now: Date): Promise<void> {
  const existing = await db.collection<Election>("elections").findOne({
    electionType: "house",
    state: fromElection.state,
    status: { $in: ["active", "upcoming"] },
  });
  if (existing) return;

  const { currentTurn, currentYear, ctx } = await getCurrentTurnAndCtx(db);
  // See foundingPhaseActive: the founding cycle re-spawn loop lives here.
  if (foundingPhaseActive(ctx)) return;
  const spawn = pickNextCanonicalCycle({
    electionType: "house",
    prevCycle: fromElection.cycle ?? 0,
    currentTurn,
    ctx,
  });
  if (!spawn) {
    console.warn(
      `[spawnHouseElection] no canonical cycle within gate for ${fromElection.state} after cycle ${fromElection.cycle}`
    );
    return;
  }

  const canonical = DEFAULT_DURATIONS.house;
  const startTime = turnToWallClock(spawn.startTurn, now, currentTurn);
  const primaryEndTime = turnToWallClock(spawn.primaryEndTurn, now, currentTurn);
  const endTime = turnToWallClock(spawn.endTurn, now, currentTurn);
  const status: "active" | "upcoming" = spawn.startTurn <= currentTurn ? "active" : "upcoming";

  // Live (census-updated) House apportionment; equals the preset seed until a
  // decennial census reapportions (P1d-2).
  const { houseSeats: liveHouseSeats } = await loadApportionment(db, ctx.preset, currentYear);

  const newElection: Omit<Election, "_id"> = {
    state: fromElection.state,
    countryId: fromElection.countryId,
    electionType: "house",
    cycle: spawn.cycle,
    electionYear: electionToLarpYear("house", spawn.cycle, undefined, undefined, ctx),
    seatId: getSeatIdFromElection({
      countryId: fromElection.countryId,
      electionType: "house",
      state: fromElection.state!,
    }),
    status,
    // Live apportionment FIRST: inheriting the resolving race's count would
    // hand a reapportioned delegation its stale size and propagate it to later
    // cycles. `fromElection.totalSeats` is the fallback for unmapped states.
    totalSeats: liveHouseSeats[fromElection.state!] || fromElection.totalSeats || 1,
    startTime,
    primaryEndTime,
    endTime,
    startTurn: spawn.startTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    durationHours: canonical.durationHours,
    primaryDurationHours: canonical.primaryDurationHours,
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await db
    .collection<Election>("elections")
    .insertOne(withCampaignRules(newElection) as Election);
  console.log(
    `[Turn] House election spawned for ${fromElection.state} cycle ${spawn.cycle} status=${status} — id ${inserted.insertedId}`
  );
}

/**
 * Spawn the next Commons election on the canonical LARP schedule. Called
 * from `generalResolution` when a regular or snap Commons cycle resolves.
 *
 * A snap resets the term clock: a resolving `snap_commons` anchors the next
 * regular at its endTurn + one term, and a regular spawned on that shifted
 * clock carries `shiftedScheduleEndTurn` so its own successor keeps counting
 * from it. Regular-to-regular transitions on the canonical calendar stay
 * canonical, so admin-accelerated prior cycles do NOT drag the calendar
 * forward. See `planNextLowerChamberCycle`.
 */
export async function spawnCommonsElection(
  db: Db,
  fromElection: Election,
  now: Date
): Promise<void> {
  const existing = await db.collection<Election>("elections").findOne({
    electionType: "commons",
    state: fromElection.state,
    status: { $in: ["active", "upcoming"] },
  });
  if (existing) return;

  const { currentTurn, ctx } = await getCurrentTurnAndCtx(db);
  // See foundingPhaseActive: the founding cycle re-spawn loop lives here.
  if (foundingPhaseActive(ctx)) return;
  // A called snap, and every regular spawned on its shifted term clock,
  // anchors the next regular. See `planNextLowerChamberCycle`.
  const plan = planNextLowerChamberCycle({
    electionType: "commons",
    snapType: "snap_commons",
    prev: fromElection,
    currentTurn,
    ctx,
    endTimeToTurn: (endTime) => endTimeToLarpTurn(endTime, now, currentTurn),
  });
  if (!plan) {
    console.warn(
      `[spawnCommonsElection] no canonical cycle within gate for ${fromElection.state} after cycle ${fromElection.cycle}`
    );
    return;
  }
  const { spawn } = plan;

  const canonical = DEFAULT_DURATIONS.commons;
  // Open the primary immediately: Commons' 5-year cycle (240 turns) far exceeds
  // its 48h `durationHours`, so the canonical `startTurn` would otherwise land a
  // long "Opens in X turns" dead zone after the prior general ends. Mirror
  // `spawnBundestagElection` — the primary fills the gap while `primaryEndTurn` /
  // `endTurn` stay canonical so the general still lands on its real-world year.
  const primaryEndTime = turnToWallClock(spawn.primaryEndTurn, now, currentTurn);
  const endTime = turnToWallClock(spawn.endTurn, now, currentTurn);
  const status: "active" | "upcoming" = "active";

  const newElection: Omit<Election, "_id"> = {
    countryId: "UK",
    state: fromElection.state,
    electionType: "commons",
    cycle: spawn.cycle,
    electionYear: plan.electionYear,
    ...(plan.shiftedScheduleEndTurn != null && {
      shiftedScheduleEndTurn: plan.shiftedScheduleEndTurn,
    }),
    seatId: getSeatIdFromElection({
      countryId: "UK",
      electionType: "commons",
      state: fromElection.state!,
    }),
    status,
    // Prefer the era map over the prior race's totalSeats — earlier cycles may
    // still carry the modern 650-seat counts under a 1953 world (#1058).
    totalSeats: getUkCommonsSeats(ctx.preset)[fromElection.state!] ?? fromElection.totalSeats ?? 1,
    startTime: now,
    primaryEndTime,
    endTime,
    startTurn: currentTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    durationHours: canonical.durationHours,
    primaryDurationHours: canonical.primaryDurationHours,
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await db
    .collection<Election>("elections")
    .insertOne(withCampaignRules(newElection) as Election);
  console.log(
    `[Turn] Commons election spawned for ${fromElection.state} cycle ${spawn.cycle} status=${status} — id ${inserted.insertedId}`
  );
}
