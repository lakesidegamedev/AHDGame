import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import { getDb } from "@/lib/mongodb";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Election, ElectionStatus, State } from "@/lib/db/types";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { turnToWallClock } from "@/lib/elections/canonicalCycle";
import { planNextLowerChamberCycle } from "@/lib/elections/snapShift";
import { getSeatIdFromElection } from "@/lib/seats";
import { seatsForRegion, type ChamberSpec } from "./chamberSpec";
import {
  buildCanonicalSpawn,
  endTimeToLarpTurn,
  getCurrentTurnAndCtx,
  justResolvedInSameTurn,
  sendBatchedElectionAnnouncements,
} from "./engine";
import { buildDelegateSeatHealOps, countryElectionsLive, mirrorPeerRaceTiming } from "./shared";

type StateSeatFields = Pick<State, "houseDistricts" | "stateSenateSeats">;

function enforcedSeats(spec: ChamberSpec, seats: number): number | undefined {
  if (spec.seats.kind === "single") return spec.seats.forceSeat ? 1 : undefined;
  if (spec.seats.enforce === "positive") return seats > 0 ? seats : undefined;
  if (spec.seats.enforce === "multiSeat") return seats > 1 ? seats : undefined;
  return undefined;
}

/**
 * Next regular race for a chamber whose term clock a snap can move. The primary
 * opens at once; the general stays on the date the planner picks.
 */
function buildSnapShiftedSpawn(
  spec: ChamberSpec,
  params: {
    regionId: string;
    seats: number;
    snapType: string;
    prev: Election | undefined;
    currentTurn: number;
    now: Date;
    ctx: Parameters<typeof planNextLowerChamberCycle>[0]["ctx"];
  }
): Omit<Election, "_id"> | null {
  const { regionId, seats, snapType, prev, currentTurn, now, ctx } = params;
  const { countryId, electionType } = spec;
  const dur = DEFAULT_DURATIONS[electionType];
  if (!dur) return null;
  const plan = planNextLowerChamberCycle({
    electionType,
    snapType,
    prev,
    currentTurn,
    ctx,
    endTimeToTurn: (endTime) => endTimeToLarpTurn(endTime, now, currentTurn),
    countryId,
  });
  if (!plan) return null;
  const { spawn } = plan;
  return {
    countryId,
    electionType,
    state: regionId,
    seatId: getSeatIdFromElection({ countryId, electionType, state: regionId }),
    cycle: spawn.cycle,
    electionYear: plan.electionYear,
    ...(plan.shiftedScheduleEndTurn != null && {
      shiftedScheduleEndTurn: plan.shiftedScheduleEndTurn,
    }),
    status: "active",
    totalSeats: prev?.totalSeats ?? seats,
    startTime: now,
    primaryEndTime: turnToWallClock(spawn.primaryEndTurn, now, currentTurn),
    endTime: turnToWallClock(spawn.endTurn, now, currentTurn),
    startTurn: currentTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    durationHours: dur.durationHours,
    primaryDurationHours: dur.durationHours - dur.generalDurationHours,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Keep a chamber's elections spawned from its spec: one election per region, or
 * one nationwide election. The shared shell for every chamber spec, so a fix to
 * scheduling lands for all of them at once.
 */
export async function ensureChamberElections(
  spec: ChamberSpec,
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  if (spec.gate === "countryLive" && !(await countryElectionsLive(db, spec.countryId))) return;
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;
  const { countryId, electionType } = spec;
  const elections = await getElectionsCollection(db);

  const regions: { id: string; seats: number }[] = [];
  if (spec.constituencies === "regions") {
    const projection: Record<string, 1> = { _id: 1 };
    if (spec.seats.kind === "stateField") projection[spec.seats.field] = 1;
    const states = await (
      await getStatesCollection(db)
    )
      .find({ countryId }, { projection })
      .toArray();
    for (const state of states) {
      const id = state._id as string;
      regions.push({ id, seats: seatsForRegion(spec, id, state as StateSeatFields, ctx.preset) });
    }
    if (regions.length === 0) return;
  } else {
    regions.push({ id: countryId, seats: 1 });
  }

  const snapType = `snap_${electionType}`;
  const typeFilter = spec.snap === "shiftsCycle" ? { $in: [electionType, snapType] } : electionType;

  const liveElections = await elections
    .find({ countryId, electionType: typeFilter, status: { $in: ["active", "upcoming"] } })
    .toArray();
  if (spec.constituencies === "nation" && liveElections.length > 0) return;
  const liveRegions = new Set(liveElections.map((e) => e.state));

  if (spec.healLiveSeats) {
    const seatMap = Object.fromEntries(regions.map((r) => [r.id, r.seats]));
    const healOps = buildDelegateSeatHealOps(liveElections, seatMap, now);
    if (healOps.length > 0) {
      await elections.bulkWrite(healOps);
      console.log(
        `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): healed ${healOps.length} in-flight seat count(s)`
      );
    }
  }

  const completedElections = await elections
    .find({ countryId, electionType: typeFilter, status: { $in: ["completed", "resolved"] } })
    .sort({ updatedAt: -1 })
    .toArray();
  const lastCompleted = (regionId: string): Election | undefined =>
    completedElections.find((e) => e.state === regionId);

  const toInsert: Omit<Election, "_id">[] = [];
  for (const region of regions) {
    if (liveRegions.has(region.id)) continue;

    const prev = lastCompleted(region.id);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;

    const peer = spec.lateJoiners === "mirrorLivePeer" && !prev ? liveElections[0] : undefined;
    const doc = peer
      ? mirrorPeerRaceTiming(countryId, peer, region.id, electionType, region.seats, now)
      : spec.snap === "shiftsCycle"
        ? buildSnapShiftedSpawn(spec, {
            regionId: region.id,
            seats: region.seats,
            snapType,
            prev,
            currentTurn,
            now,
            ctx,
          })
        : buildCanonicalSpawn({
            electionType,
            countryId,
            state: region.id,
            prev,
            currentTurn,
            now,
            fallbackTotalSeats: region.seats,
            ctx,
            openPrimaryImmediately: spec.openPrimaryImmediately,
          });
    if (!doc) continue;

    const forced = enforcedSeats(spec, region.seats);
    if (forced !== undefined && !peer) doc.totalSeats = forced;

    toInsert.push(doc);
  }
  if (toInsert.length === 0) return;

  if (spec.constituencies === "nation") {
    const [doc] = toInsert;
    const concurrent = await elections.findOne({
      countryId,
      electionType,
      state: doc!.state,
      status: { $in: ["active", "upcoming"] },
    });
    if (concurrent) return;
    await elections.insertOne(withCampaignRules(doc!) as Election);
    console.log(
      `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): spawned 1 election`
    );
    sendBatchedElectionAnnouncements([doc!], now);
    return;
  }

  const existing = await elections
    .find(
      {
        countryId,
        $or: toInsert.map((e) => ({
          electionType,
          state: e.state,
          status: { $in: ["active", "upcoming"] as ElectionStatus[] },
        })),
      },
      { projection: { state: 1 } }
    )
    .toArray();
  const existingStates = new Set(existing.map((e) => e.state));
  const toActuallyInsert = toInsert.filter((e) => !existingStates.has(e.state));
  if (toActuallyInsert.length === 0) return;

  await elections.insertMany(toActuallyInsert.map(withCampaignRules) as Election[]);
  console.log(
    `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): spawned ${toActuallyInsert.length} ${electionType} election(s)`
  );
  sendBatchedElectionAnnouncements(toActuallyInsert, now);
}
