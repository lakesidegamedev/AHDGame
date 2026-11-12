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
 * Next regular race for a chamber whose term clock a snap can move. The general
 * stays on the date the planner picks; the primary opens at once, or on the
 * planner's start turn when the spec does not open it immediately.
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
  const startTurn = spec.openPrimaryImmediately ? currentTurn : spawn.startTurn;
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
    status: startTurn <= currentTurn ? "active" : "upcoming",
    totalSeats: prev?.totalSeats ?? seats,
    startTime: spec.openPrimaryImmediately ? now : turnToWallClock(startTurn, now, currentTurn),
    primaryEndTime: turnToWallClock(spawn.primaryEndTurn, now, currentTurn),
    endTime: turnToWallClock(spawn.endTurn, now, currentTurn),
    startTurn,
    primaryEndTurn: spawn.primaryEndTurn,
    endTurn: spawn.endTurn,
    durationHours: dur.durationHours,
    primaryDurationHours: dur.durationHours - dur.generalDurationHours,
    createdAt: now,
    updatedAt: now,
  };
}

/** Per-call inputs a country shell supplies. */
export interface ChamberRunOptions {
  /** Run one staggered class only. */
  chamberClass?: 1 | 2;
  /** Passed to `hooks.decorate`; anything the shell had to read from the database. */
  extra?: unknown;
}

/**
 * Keep a chamber's elections spawned from its spec: one election per region, or
 * one nationwide election, per staggered class if the chamber has them. The
 * shared shell for every chamber spec, so a fix to scheduling lands for all of
 * them at once. Returns the races it inserted.
 */
export async function ensureChamberElections(
  spec: ChamberSpec,
  now: Date,
  inFlightTurn?: number,
  options: ChamberRunOptions = {}
): Promise<Omit<Election, "_id">[]> {
  const db = await getDb();
  if (spec.gate === "countryLive" && !(await countryElectionsLive(db, spec.countryId))) return [];
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;
  const { countryId } = spec;

  const regionIds: string[] = [];
  const stateDocs = new Map<string, StateSeatFields>();
  if (spec.constituencies === "regions") {
    const projection: Record<string, 1> = { _id: 1 };
    if (spec.seats.kind === "stateField") projection[spec.seats.field] = 1;
    const states = await (
      await getStatesCollection(db)
    )
      .find({ countryId }, { projection })
      .toArray();
    for (const state of states) {
      regionIds.push(state._id as string);
      stateDocs.set(state._id as string, state as StateSeatFields);
    }
    if (regionIds.length === 0) return [];
  } else {
    regionIds.push(countryId);
  }

  const classes: (1 | 2 | undefined)[] = spec.classes
    ? options.chamberClass
      ? [options.chamberClass]
      : [1, 2]
    : [undefined];
  const inserted: Omit<Election, "_id">[] = [];
  for (const chamberClass of classes) {
    const regions = regionIds.map((id) => ({
      id,
      seats:
        spec.constituencies === "regions"
          ? seatsForRegion(spec, id, stateDocs.get(id), ctx.preset, chamberClass)
          : 1,
    }));
    inserted.push(
      ...(await ensureClass(spec, regions, chamberClass, now, currentTurn, ctx, options.extra))
    );
  }
  return inserted;
}

async function ensureClass(
  spec: ChamberSpec,
  regions: { id: string; seats: number }[],
  chamberClass: 1 | 2 | undefined,
  now: Date,
  currentTurn: number,
  ctx: Awaited<ReturnType<typeof getCurrentTurnAndCtx>>["ctx"],
  extra: unknown
): Promise<Omit<Election, "_id">[]> {
  const db = await getDb();
  const { countryId, electionType } = spec;
  const elections = await getElectionsCollection(db);
  const classFilter = chamberClass ? { chamberClass } : {};

  const snapType = `snap_${electionType}`;
  const typeFilter = spec.snap === "shiftsCycle" ? { $in: [electionType, snapType] } : electionType;

  const liveElections = await elections
    .find({
      countryId,
      electionType: typeFilter,
      ...classFilter,
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  if (spec.constituencies === "nation" && liveElections.length > 0) return [];
  const liveRegions = new Set(liveElections.map((e) => e.state));

  const healOps = [
    ...(spec.healLiveSeats
      ? buildDelegateSeatHealOps(
          liveElections,
          Object.fromEntries(regions.map((r) => [r.id, r.seats])),
          now
        )
      : []),
    ...(spec.hooks?.healLive?.(liveElections, { preset: ctx.preset, now }) ?? []),
  ];
  if (healOps.length > 0) {
    await elections.bulkWrite(healOps);
    console.log(
      `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): healed ${healOps.length} in-flight race(s)`
    );
  }

  const completedElections = await elections
    .find({
      countryId,
      electionType: typeFilter,
      ...classFilter,
      status: { $in: ["completed", "resolved"] },
    })
    .sort({ updatedAt: -1 })
    .toArray();
  const lastCompleted = (regionId: string): Election | undefined =>
    completedElections.find((e) => e.state === regionId);

  const toInsert: Omit<Election, "_id">[] = [];
  for (const region of regions) {
    if (liveRegions.has(region.id)) continue;

    const prev = lastCompleted(region.id);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;

    const customCycle1EndTurn = spec.regionAnchor?.(region.id, ctx.preset, ctx);
    if (spec.regionAnchor && customCycle1EndTurn === undefined) {
      throw new Error(
        `Chamber ${countryId}/${spec.chamberId} has no cycle anchor for ${region.id}`
      );
    }

    const peer = spec.lateJoiners === "mirrorLivePeer" && !prev ? liveElections[0] : undefined;
    let doc = peer
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
            chamberClass,
            prev,
            currentTurn,
            now,
            fallbackTotalSeats: region.seats,
            ctx,
            openPrimaryImmediately: spec.openPrimaryImmediately,
            customCycle1EndTurn,
          });
    if (!doc) continue;

    const forced = enforcedSeats(spec, region.seats);
    if (forced !== undefined && !peer) doc.totalSeats = forced;
    if (spec.hooks?.decorate && !peer) {
      doc = spec.hooks.decorate(doc, { regionId: region.id, preset: ctx.preset, extra });
    }

    toInsert.push(doc);
  }
  if (toInsert.length === 0) return [];

  const label = chamberClass ? ` class ${chamberClass}` : "";
  const announce = (docs: Omit<Election, "_id">[]) => {
    if (!spec.silent) sendBatchedElectionAnnouncements(docs, now);
  };

  if (spec.constituencies === "nation") {
    const [doc] = toInsert;
    const concurrent = await elections.findOne({
      countryId,
      electionType,
      state: doc!.state,
      status: { $in: ["active", "upcoming"] },
    });
    if (concurrent) return [];
    await elections.insertOne(withCampaignRules(doc!) as Election);
    console.log(
      `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): spawned 1 election`
    );
    announce([doc!]);
    return [doc!];
  }

  const existing = await elections
    .find(
      {
        countryId,
        $or: toInsert.map((e) => ({
          electionType,
          ...classFilter,
          state: e.state,
          status: { $in: ["active", "upcoming"] as ElectionStatus[] },
        })),
      },
      { projection: { state: 1 } }
    )
    .toArray();
  const existingStates = new Set(existing.map((e) => e.state));
  const toActuallyInsert = toInsert.filter((e) => !existingStates.has(e.state));
  if (toActuallyInsert.length === 0) return [];

  await elections.insertMany(toActuallyInsert.map(withCampaignRules) as Election[]);
  console.log(
    `[Turn] ensureChamberElections(${countryId} ${spec.chamberId}): spawned ${toActuallyInsert.length} ${electionType} election(s)${label}`
  );
  announce(toActuallyInsert);
  return toActuallyInsert;
}
