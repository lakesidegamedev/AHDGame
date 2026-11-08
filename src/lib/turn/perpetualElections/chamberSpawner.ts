import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import { getDb } from "@/lib/mongodb";
import type { Election, ElectionStatus, State } from "@/lib/db/types";
import { seatsForRegion, type ChamberSpec } from "./chamberSpec";
import {
  buildCanonicalSpawn,
  getCurrentTurnAndCtx,
  justResolvedInSameTurn,
  sendBatchedElectionAnnouncements,
} from "./engine";
import { countryElectionsLive, mirrorPeerRaceTiming } from "./shared";

type StateSeatFields = Pick<State, "houseDistricts" | "stateSenateSeats">;

function enforcedSeats(spec: ChamberSpec, seats: number): number | undefined {
  if (spec.seats.kind !== "stateField") return undefined;
  if (spec.seats.enforce === "positive") return seats > 0 ? seats : undefined;
  if (spec.seats.enforce === "multiSeat") return seats > 1 ? seats : undefined;
  return undefined;
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
  const elections = db.collection<Election>("elections");

  const regions: { id: string; seats: number }[] = [];
  if (spec.constituencies === "regions") {
    const projection: Record<string, 1> = { _id: 1 };
    if (spec.seats.kind === "stateField") projection[spec.seats.field] = 1;
    const states = await db
      .collection<State>("states")
      .find({ countryId }, { projection })
      .toArray();
    for (const state of states) {
      const id = state._id as string;
      regions.push({ id, seats: seatsForRegion(spec, id, state as StateSeatFields) });
    }
    if (regions.length === 0) return;
  } else {
    regions.push({ id: countryId, seats: 1 });
  }

  const liveElections = await elections
    .find({ countryId, electionType, status: { $in: ["active", "upcoming"] } })
    .toArray();
  if (spec.constituencies === "nation" && liveElections.length > 0) return;
  const liveRegions = new Set(liveElections.map((e) => e.state));

  const completedElections = await elections
    .find({ countryId, electionType, status: { $in: ["completed", "resolved"] } })
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
