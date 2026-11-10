/** Create and heal Japan's regional races while retaining their frozen electoral rules. */
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import { getDb } from "@/lib/mongodb";
import type { CountryGameState, Election, ElectionStatus, State } from "@/lib/db/types";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { pickNextCanonicalCycle, turnToWallClock } from "@/lib/elections/canonicalCycle";
import { electionToLarpYear } from "@/lib/utils/formatters";
import { getSeatIdFromElection } from "@/lib/seats";
import {
  getCurrentTurnAndCtx,
  getGeneralWindow,
  justResolvedInSameTurn,
  sendBatchedElectionAnnouncements,
} from "@/lib/elections/scheduling/engine";
import { ensureRegionalGovernorElections } from "@/lib/elections/scheduling/shared";
import { ensureChamberElections } from "@/lib/elections/scheduling/chamberSpawner";
import { JP_SANGIIN_SPEC, JP_SHUGIIN_SPEC } from "./chamberSpecs";

/**
 * Ensure every JP region has an active or upcoming Shugiin election.
 *
 * Spawns anchor to the canonical schedule. A snap election resets the term
 * clock; later regulars count from the shifted schedule until another snap
 * moves it. See `planNextLowerChamberCycle`. If the current turn has eaten too
 * deep into the next canonical window, the spawner walks forward to the
 * following cycle rather than producing a stub race.
 */
export async function ensureJPElections(now: Date, inFlightTurn?: number): Promise<void> {
  const db = await getDb();
  const jpCountryState = await db
    .collection<CountryGameState>("countryGameStates")
    .findOne({ _id: "JP" }, { projection: { jpShugiinElectoralMandate: 1 } });
  await ensureChamberElections(JP_SHUGIIN_SPEC, now, inFlightTurn, {
    extra: jpCountryState?.jpShugiinElectoralMandate,
  });
}

// ─── Japan: Sangiin (House of Councillors) Half-Elections ────────────────────

/**
 * Ensure Sangiin elections exist for JP regions in BOTH classes.
 *
 * Each class runs a 6-year (288-turn) cycle anchored to its real-world
 * election date; half of the era's seats (252 in 1991, else 248) are contested
 * every 3 game years (144 turns). Status is "active" from the spawn turn: the
 * primary opens at once and the general stays on its real-world year.
 */
export async function ensureJPCouncillorElections(
  now: Date,
  classOverride?: 1 | 2,
  inFlightTurn?: number
): Promise<void> {
  await ensureChamberElections(JP_SANGIIN_SPEC, now, inFlightTurn, {
    chamberClass: classOverride,
  });
}

// ─── Japan: Regional Council (prefectural assembly) ──────────────────────────

/**
 * Mirrors the region's live Shugiin race (timestamps, cycle, electionYear)
 * so both resolve together on a JP-correct calendar, bypassing the
 * UK-anchored regionalCouncil branch in canonicalCycle.ts. Falls back to
 * the Shugiin canonical schedule when no live race exists.
 *
 * Runs concurrently with ensureJPElections, so a Shugiin created this turn
 * may not be visible. Both paths converge on the same schedule, so that's fine.
 */
export async function ensureJPRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;

  const jpRegions = await db
    .collection<State>("states")
    .find({ countryId: "JP" }, { projection: { _id: 1, stateSenateSeats: 1 } })
    .toArray();
  const regions = jpRegions.map((r) => ({ id: r._id as string, seats: r.stateSenateSeats }));
  if (regions.length === 0) return;

  // Country-scoped: UK's spawner relies on disjoint region IDs and is not
  // country-scoped; JP's is scoped to avoid cross-country contamination.
  const liveElections = await db
    .collection<Election>("elections")
    .find({
      electionType: "regionalCouncil",
      countryId: "JP",
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  const liveCouncils = new Set(liveElections.map((e) => e.state));

  const completedElections = await db
    .collection<Election>("elections")
    .find({
      electionType: "regionalCouncil",
      countryId: "JP",
      status: { $in: ["completed", "resolved"] },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  function lastCompleted(regionId: string): Election | undefined {
    return completedElections.find((e) => e.state === regionId);
  }

  const dur = DEFAULT_DURATIONS.regionalCouncil.durationHours;
  const genDur = getGeneralWindow("regionalCouncil");

  // Sync source: live Shugiin (regular or snap) per region.
  const liveShugiinElections = await db
    .collection<Election>("elections")
    .find({
      electionType: { $in: ["shugiin", "snap_shugiin"] },
      countryId: "JP",
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  const shugiinByRegion = new Map(liveShugiinElections.map((e) => [e.state, e]));

  const toInsert: Omit<Election, "_id">[] = [];

  for (const region of regions) {
    const regionId = region.id;
    if (liveCouncils.has(regionId)) continue;

    const prev = lastCompleted(regionId);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;

    const totalSeats = prev?.totalSeats ?? region.seats ?? 1;

    // Mirror path: copy the live Shugiin's schedule, cycle, and year so both
    // races resolve together on a JP-correct calendar.
    const shugiin = shugiinByRegion.get(regionId);
    if (shugiin?.startTime && shugiin?.primaryEndTime && shugiin?.endTime) {
      toInsert.push({
        countryId: "JP",
        electionType: "regionalCouncil",
        state: regionId,
        seatId: getSeatIdFromElection({
          countryId: "JP",
          electionType: "regionalCouncil",
          state: regionId,
        }),
        cycle: shugiin.cycle,
        electionYear: shugiin.electionYear,
        status: shugiin.status as "active" | "upcoming",
        totalSeats,
        startTime: shugiin.startTime,
        primaryEndTime: shugiin.primaryEndTime,
        endTime: shugiin.endTime,
        startTurn: shugiin.startTurn,
        primaryEndTurn: shugiin.primaryEndTurn,
        endTurn: shugiin.endTurn,
        durationHours: dur,
        primaryDurationHours: dur - genDur,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    // Fallback: no live Shugiin to mirror — spawn on the Shugiin canonical
    // schedule. No open-primary-immediately: Shugiin's canonical startTurn
    // already equals the prior endTurn, so there is no dead zone to fill.
    const spawn = pickNextCanonicalCycle({
      electionType: "shugiin",
      prevCycle: prev?.cycle ?? 0,
      currentTurn,
      ctx,
    });
    if (!spawn) continue;

    const startTime = turnToWallClock(spawn.startTurn, now, currentTurn);
    const primaryEndTime = turnToWallClock(spawn.primaryEndTurn, now, currentTurn);
    const endTime = turnToWallClock(spawn.endTurn, now, currentTurn);
    const status: "active" | "upcoming" = spawn.startTurn <= currentTurn ? "active" : "upcoming";

    toInsert.push({
      countryId: "JP",
      electionType: "regionalCouncil",
      state: regionId,
      seatId: getSeatIdFromElection({
        countryId: "JP",
        electionType: "regionalCouncil",
        state: regionId,
      }),
      cycle: spawn.cycle,
      electionYear: electionToLarpYear("shugiin", spawn.cycle, undefined, undefined, ctx),
      status,
      totalSeats,
      startTime,
      primaryEndTime,
      endTime,
      startTurn: spawn.startTurn,
      primaryEndTurn: spawn.primaryEndTurn,
      endTurn: spawn.endTurn,
      durationHours: dur,
      primaryDurationHours: dur - genDur,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toInsert.length === 0) return;

  // Guard against duplicates (same safety as ensureUKRegionalCouncilElections).
  const orFilters = toInsert.map((e) => ({
    electionType: "regionalCouncil" as const,
    countryId: "JP" as const,
    state: e.state,
    status: { $in: ["active", "upcoming"] as ElectionStatus[] },
  }));
  const existing = await db
    .collection<Election>("elections")
    .find({ $or: orFilters }, { projection: { state: 1 } })
    .toArray();
  const existingStates = new Set(existing.map((e) => e.state));
  const toActuallyInsert = toInsert.filter((e) => !existingStates.has(e.state));

  if (toActuallyInsert.length > 0) {
    await db
      .collection<Election>("elections")
      .insertMany(toActuallyInsert.map(withCampaignRules) as Election[]);
    console.log(
      `[Turn] ensureJPRegionalCouncilElections: spawned ${toActuallyInsert.length} missing Regional Council election(s)`
    );
    sendBatchedElectionAnnouncements(toActuallyInsert, now);
  }
}

/**
 * Spawn perpetual governor elections for all 8 JP regions on a
 * preset-anchored 4-year cycle.
 */
export async function ensureJPGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalGovernorElections("JP", now, undefined, inFlightTurn);
}
