import { successorCouncilSeats } from "@/lib/countries/ukSuccessorRegions";
import { reconcileUKDevolution } from "@/lib/countries/uk/devolution/service";
import {
  executiveCycleAnchor,
  usesUKDevolution,
  type UKExecutiveRegion,
} from "@/lib/countries/uk/devolution/rules";
import { yearOfTurn } from "@/lib/utils/gameDate";
import { withCampaignRules } from "@/lib/campaignTargeting/rules";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCountryAccessFromDb } from "@/lib/countryAccess";
import type { Election, ElectionStatus, State } from "@/lib/db/types";
import { type CountryId } from "@/lib/constants/countries";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { pickNextCanonicalCycle, turnToWallClock } from "@/lib/elections/canonicalCycle";
import type { CycleAnchorContext } from "@/lib/elections/cycleAnchorContext";
import { electionToLarpYear } from "@/lib/utils/formatters";
import { getSeatIdFromElection } from "@/lib/seats";
import { IE_LOCAL_COUNCIL_SEATS } from "@/lib/countries/ie/data/ieLocalCouncilSeats";
import { planNextLowerChamberCycle } from "@/lib/elections/snapShift";
import {
  buildCanonicalSpawn,
  endTimeToLarpTurn,
  getCurrentTurnAndCtx,
  getGeneralWindow,
  justResolvedInSameTurn,
  sendBatchedElectionAnnouncements,
} from "./engine";

/**
 * Config for one country's per-region multi-seat delegate election family.
 * Each field is what differs between the regional delegate spawners.
 */
export interface RegionalDelegateSpec {
  /** Frozen ballots retain their capacity; the country owns any law transition. */
  preserveLiveSeatCounts?: boolean;
  countryId: CountryId;
  /** electionType === officeType key (the CN convention). */
  electionType: string;
  /**
   * Authoritative per-region seat count, computed from the full region list so
   * cross-region apportionment sees every region at once.
   *
   * A region present here has its spawned race sized from this map even over a
   * previous cycle's count. OMIT a region the map cannot size: an absent entry
   * falls back to the previous cycle's count.
   *
   * `preset` is the active world preset so era-apportioned families size races
   * consistently with the seed.
   */
  seatsForRegions: (
    regions: State[],
    preset: string | undefined,
    ctx: CycleAnchorContext,
    currentYear: number
  ) => Record<string, number>;
  /** Open the primary immediately (short window vs multi-year cycle). CN/BR: true. */
  openPrimaryImmediately: boolean;
  minPrimaryHours?: number;
  /** Country-owned clocks can retain founding terms and bound legal standups. */
  buildSpawn?: typeof buildCanonicalSpawn;
  canSpawnCohort?: (elections: readonly Election[]) => boolean;
  /**
   * No-op unless the runtime country status is beta/active. CN/BR are always
   * live and omit this; RU (coming-soon, per-game enabled) sets it in Phase 3.
   */
  statusGated?: boolean;
  /**
   * Liveness gate applied when `statusGated`. Defaults to
   * `countryElectionsLive`. RU overrides with `ruElectionsLive` so its
   * Supreme Soviet also runs under the NPP governing brain.
   */
  electionsLiveGate?: (db: Db, countryId: CountryId) => Promise<boolean>;
  /** Human label for the log line + announcements, e.g. "NPC Delegate", "Câmara". */
  label: string;
}

/**
 * Seat map from the region field that sizes this chamber, OMITTING any region
 * the field does not size.
 *
 * The omission is the point. Substituting 1 for a missing field would make "this
 * region seats one deputy" indistinguishable from "this region doc cannot say",
 * and the caller treats a present entry as authoritative enough to overrule the
 * previous cycle — so a region that lost its field would have its delegation
 * forced to 1 rather than left alone.
 */
export function seatsFromRegionField(
  regions: State[],
  field: "houseDistricts" | "stateSenateSeats"
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const region of regions) {
    const seats = region[field];
    if (typeof seats === "number" && seats > 0) out[region._id as string] = seats;
  }
  return out;
}

/**
 * Heal `totalSeats` on a regional delegate race already in flight when its
 * chamber was resized.
 *
 * The spawn-time force only reaches the NEXT cycle, so a race running when the
 * region changed size is never corrected. `allocateSeats` overrides
 * `totalSeats` from a live map for the US House and the Commons ONLY; every
 * other family allocates over the number on the Election doc, so a stale race
 * would shrink the delegation.
 */
export function buildDelegateSeatHealOps(
  liveElections: Pick<Election, "_id" | "state" | "totalSeats">[],
  seatMap: Record<string, number>,
  now: Date
): AnyBulkWriteOperation<Election>[] {
  return liveElections.flatMap((e) => {
    if (!e.state) return [];
    const expected = seatMap[e.state];
    // Absent or not a positive number means the region cannot size this chamber,
    // so there is nothing authoritative to heal towards — leave the race as it is
    // rather than zeroing it. Written as `!(expected > 0)` rather than
    // `expected <= 0` so a NaN seat count is REJECTED: every comparison against
    // NaN is false, so the `<= 0` form would fall through both guards and write
    // NaN over a perfectly good seat count. Same test the spawn-time force uses.
    if (!(typeof expected === "number" && expected > 0)) return [];
    if (e.totalSeats === expected) return [];
    return [
      {
        updateOne: {
          filter: { _id: e._id },
          update: { $set: { totalSeats: expected, updatedAt: now } },
        },
      },
    ];
  });
}

/**
 * Ensure every region of `spec.countryId` has an active/upcoming election of
 * `spec.electionType`. Canonical LARP scheduling via `buildCanonicalSpawn` —
 * no snap elections, no staggered classes. Extracted from the formerly-
 * duplicated ensureCNElections / ensureCNPeoplesCongressElections /
 * ensureBRElections bodies.
 */
export async function ensureRegionalDelegateElections(
  spec: RegionalDelegateSpec,
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  if (spec.statusGated) {
    const gate = spec.electionsLiveGate ?? countryElectionsLive;
    if (!(await gate(db, spec.countryId))) return;
  }
  const { currentTurn: persistedTurn, currentYear, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;

  const regions = await db
    .collection<State>("states")
    .find(
      { countryId: spec.countryId },
      { projection: { _id: 1, population: 1, houseDistricts: 1, stateSenateSeats: 1 } }
    )
    .toArray();
  if (regions.length === 0) return;
  const seatMap = spec.seatsForRegions(regions as State[], ctx.preset, ctx, currentYear);

  const liveElections = await db
    .collection<Election>("elections")
    .find({
      countryId: spec.countryId,
      electionType: spec.electionType,
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  const liveStates = new Set(liveElections.map((e) => e.state));

  // Carry a resize onto the race that is already running, before deciding what
  // to spawn — a region present in `liveStates` gets no new doc, so without this
  // its correction would wait a whole cycle.
  const healOps = spec.preserveLiveSeatCounts
    ? []
    : buildDelegateSeatHealOps(liveElections, seatMap, now);
  if (healOps.length > 0) {
    await db.collection<Election>("elections").bulkWrite(healOps);
    console.log(
      `[Turn] ensureRegionalDelegateElections(${spec.countryId}/${spec.electionType}): healed ${healOps.length} in-flight ${spec.label} seat count(s)`
    );
  }

  const completedElections = await db
    .collection<Election>("elections")
    .find({
      countryId: spec.countryId,
      electionType: spec.electionType,
      status: { $in: ["completed", "resolved"] },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  if (spec.canSpawnCohort && !spec.canSpawnCohort([...liveElections, ...completedElections]))
    return;

  function lastCompleted(regionId: string): Election | undefined {
    return completedElections.find((e) => e.state === regionId);
  }

  const toInsert: Omit<Election, "_id">[] = [];

  for (const region of regions) {
    const regionId = region._id as string;
    if (liveStates.has(regionId)) continue;

    const prev = lastCompleted(regionId);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;

    const doc = (spec.buildSpawn ?? buildCanonicalSpawn)({
      electionType: spec.electionType,
      countryId: spec.countryId,
      state: regionId,
      prev,
      currentTurn,
      now,
      fallbackTotalSeats: seatMap[regionId] ?? 1,
      ctx,
      openPrimaryImmediately: spec.openPrimaryImmediately,
      minPrimaryHours: spec.minPrimaryHours,
    });
    if (!doc) continue;

    // buildCanonicalSpawn inherits `prev?.totalSeats`, which freezes a region's
    // delegation at whatever its FIRST cycle said and never consults the region
    // doc again. That is wrong wherever a chamber can be resized mid-game: after
    // German reunification the six pre-accession Laender still advertised their
    // 1953 Volkskammer allocation (Sachsen 151) while the live chamber sized
    // them from `houseDistricts` (Sachsen 55), so the elections page and the map
    // disagreed on every one of them (#1262). NG hit the same inheritance with
    // its buggy `totalSeats: 1` (#901) and forces the value in its own spawner;
    // this is that fix, in the shared helper, for every family routed through it.
    const authoritativeSeats = seatMap[regionId];
    if (typeof authoritativeSeats === "number" && authoritativeSeats > 0) {
      doc.totalSeats = authoritativeSeats;
    }

    toInsert.push(doc);
  }

  if (toInsert.length === 0) return;

  const orFilters = toInsert.map((e) => ({
    electionType: spec.electionType,
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
      `[Turn] ensureRegionalDelegateElections(${spec.countryId}/${spec.electionType}): spawned ${toActuallyInsert.length} missing ${spec.label} election(s)`
    );
    sendBatchedElectionAnnouncements(toActuallyInsert, now);
  }
}

// ─── China: NPC Delegate elections ──────────────────────────────────────────

/**
 * Status/NPP-governed gate for DD election families (the RU shape): live when
 * the country is beta/active, or when an NPP brain governs a coming-soon DD so
 * its chamber re-elects instead of freezing.
 */
export async function ddElectionsLive(db: Db): Promise<boolean> {
  const { status, nppGoverned } = await getCountryAccessFromDb(db, "DD");
  if (status === "beta" || status === "active") return true;
  return nppGoverned;
}

/**
 * Eastern-bloc NPP/beta election gate (DD/RU shape): live when the country is
 * beta/active, or when an NPP brain governs a coming-soon economy-preview row
 * so the assembly re-elects instead of freezing.
 */
export async function easternBlocElectionsLive(db: Db, countryId: CountryId): Promise<boolean> {
  const { status, nppGoverned } = await getCountryAccessFromDb(db, countryId);
  if (status === "beta" || status === "active") return true;
  return nppGoverned;
}

export async function ensureEasternBlocAssemblyElections(
  countryId: CountryId,
  electionType: string,
  label: string,
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId,
      electionType,
      seatsForRegions: (regions) => seatsFromRegionField(regions, "houseDistricts"),
      openPrimaryImmediately: true,
      statusGated: true,
      electionsLiveGate: easternBlocElectionsLive,
      label,
    },
    now,
    inFlightTurn
  );
}

/**
 * Clone a live peer race's timing for a region that joined mid-cycle (NI
 * reunifying into Ireland), so the newcomer's race resolves on the SAME schedule
 * as the rest of the country instead of opening its own canonical cycle. Mirrors
 * the Commons→regionalCouncil sync in {@link ensureUKRegionalCouncilElections}.
 */
export function mirrorPeerRaceTiming(
  countryId: CountryId,
  peer: Election,
  state: string,
  electionType: string,
  totalSeats: number,
  now: Date
): Omit<Election, "_id"> {
  return {
    countryId,
    electionType,
    state,
    seatId: getSeatIdFromElection({ countryId, electionType, state }),
    cycle: peer.cycle,
    electionYear: peer.electionYear,
    status: peer.status === "upcoming" ? "upcoming" : "active",
    totalSeats,
    startTime: peer.startTime,
    primaryEndTime: peer.primaryEndTime,
    endTime: peer.endTime,
    startTurn: peer.startTurn,
    primaryEndTurn: peer.primaryEndTurn,
    endTurn: peer.endTurn,
    durationHours: peer.durationHours,
    primaryDurationHours: peer.primaryDurationHours,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Runtime status gate for beta-country election spawners — same two-tier
 * DB-over-config source as {@link ngElectionsLive}: flipping the admin status
 * to "beta"/"active" turns the country's cycle on with no redeploy, and a
 * coming-soon country never spawns NPC elections on the live world. Explicit
 * allow-list so an unexpected status never silently enables spawning.
 */
export async function countryElectionsLive(db: Db, countryId: CountryId): Promise<boolean> {
  const { status } = await getCountryAccessFromDb(db, countryId);
  return status === "beta" || status === "active";
}

/**
 * RU-specific election gate. RU is intentionally `coming-soon`, so the standard
 * `countryElectionsLive` gate spawns nothing for its legislature. Run RU's
 * chambers when RU is genuinely live (`beta`/`active`) OR when RU is
 * NPP-governed (global NPP autonomy >= v1 and not player-enabled), which
 * surfaces the legislature read-only without flipping RU to player-live.
 */
export async function ruElectionsLive(db: Db, _countryId: CountryId = "RU"): Promise<boolean> {
  const { status, nppGoverned } = await getCountryAccessFromDb(db, "RU");
  if (status === "beta" || status === "active") return true;
  return nppGoverned;
}

/**
 * Ensure every region of a beta-tier country's SENATE has an active/upcoming
 * election. Sibling to the beta lower-chamber chamber specs, but seats come from
 * `state.stateSenateSeats`, NOT `houseDistricts` (that is the lower chamber's
 * seat map, seeded independently).
 *
 * Without this spawner lapsed senators are never refilled and upper chambers
 * trend toward empty as terms lapse.
 *
 * No snap-election handling: no snap-senate concept exists, unlike the
 * lower-chamber specs' `snap_${electionType}` family.
 */
export async function ensureBetaSenateElections(
  countryId: CountryId,
  electionType: string,
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  if (!(await countryElectionsLive(db, countryId))) return;
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;

  const regions = await db
    .collection<State>("states")
    .find({ countryId }, { projection: { _id: 1, stateSenateSeats: 1 } })
    .toArray();
  const regionIds = regions.map((r) => r._id as string);
  if (regionIds.length === 0) return;
  const seatsByRegion = new Map<string, number>(
    regions.map((r) => [r._id as string, (r as State).stateSenateSeats ?? 1])
  );

  const liveElections = await db
    .collection<Election>("elections")
    .find({
      countryId,
      electionType,
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  const liveRegions = new Set(liveElections.map((e) => e.state));
  const seatHealOps: AnyBulkWriteOperation<Election>[] = liveElections.flatMap((election) => {
    const authoritative = seatsByRegion.get(election.state);
    if (!authoritative || election.totalSeats === authoritative) return [];
    return [
      {
        updateOne: {
          filter: {
            _id: election._id,
            totalSeats: election.totalSeats,
            status: { $in: ["active", "upcoming"] as ElectionStatus[] },
          },
          update: { $set: { totalSeats: authoritative, updatedAt: now } },
        },
      },
    ];
  });
  if (seatHealOps.length > 0) {
    await db.collection<Election>("elections").bulkWrite(seatHealOps);
  }

  const completedElections = await db
    .collection<Election>("elections")
    .find({
      countryId,
      electionType,
      status: { $in: ["completed", "resolved"] },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  function lastCompleted(regionId: string): Election | undefined {
    return completedElections.find((e) => e.state === regionId);
  }

  const dur = DEFAULT_DURATIONS[electionType];
  if (!dur) return;

  const toInsert: Omit<Election, "_id">[] = [];

  for (const regionId of regionIds) {
    if (liveRegions.has(regionId)) continue;

    const prev = lastCompleted(regionId);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;

    const spawn = pickNextCanonicalCycle({
      electionType,
      countryId,
      prevCycle: prev?.cycle ?? 0,
      currentTurn,
      ctx,
    });
    if (!spawn) continue; // era-gated (ES 1953, TR outside 1953-default) or gate exhausted

    // Open the primary immediately (mirrors the beta lower-chamber spawner):
    // the multi-year cycle far exceeds the 48h window, so the canonical
    // startTurn would otherwise leave a long dead zone.
    const startTurn = currentTurn;
    const startTime = now;
    const primaryEndTime = turnToWallClock(spawn.primaryEndTurn, now, currentTurn);
    const endTime = turnToWallClock(spawn.endTurn, now, currentTurn);

    toInsert.push({
      countryId,
      electionType,
      state: regionId,
      seatId: getSeatIdFromElection({ countryId, electionType, state: regionId }),
      cycle: spawn.cycle,
      electionYear: electionToLarpYear(electionType, spawn.cycle, undefined, undefined, ctx),
      status: "active",
      // Region data is authoritative. Carrying a prior cycle forward makes a
      // corrected apportionment ineffective forever after the first bad race.
      totalSeats: seatsByRegion.get(regionId) ?? prev?.totalSeats ?? 1,
      startTime,
      primaryEndTime,
      endTime,
      startTurn,
      primaryEndTurn: spawn.primaryEndTurn,
      endTurn: spawn.endTurn,
      durationHours: dur.durationHours,
      primaryDurationHours: dur.durationHours - dur.generalDurationHours,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toInsert.length === 0) return;

  const orFilters = toInsert.map((e) => ({
    electionType,
    state: e.state,
    status: { $in: ["active", "upcoming"] as ElectionStatus[] },
  }));
  const existing = await db
    .collection<Election>("elections")
    .find({ countryId, $or: orFilters }, { projection: { state: 1 } })
    .toArray();
  const existingStates = new Set(existing.map((e) => e.state));
  const toActuallyInsert = toInsert.filter((e) => !existingStates.has(e.state));

  if (toActuallyInsert.length > 0) {
    await db
      .collection<Election>("elections")
      .insertMany(toActuallyInsert.map(withCampaignRules) as Election[]);
    console.log(
      `[Turn] ensureBetaSenateElections(${countryId}): spawned ${toActuallyInsert.length} ${electionType} election(s)`
    );
    sendBatchedElectionAnnouncements(toActuallyInsert, now);
  }
}

/**
 * Standup-cycle spawner for a seceded country's devolved lower chamber
 * (SCO Holyrood / WAL Senedd). Modeled on `ensureIEElections`: one canonical
 * per-sub-region race (AMS constituency tier, seats = the sub-region's
 * `houseDistricts`), scheduled at the NEXT canonical cycle (no
 * `openPrimaryImmediately`) so carried-over MPs hold their seats until the
 * first standup election. A no-op until the country has states (post-secession
 * expansion), so it is safe to run every turn from the country-election phase.
 */
export async function ensureSecededChamberElections(
  countryId: CountryId,
  electionType: string,
  now: Date,
  opts?: { seatsByRegion?: Record<string, number>; seatsPerRegion?: number },
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;

  const regions = await db
    .collection<State>("states")
    .find({ countryId }, { projection: { _id: 1, houseDistricts: 1 } })
    .toArray();
  const regionIds = regions.map((r) => r._id as string);
  if (regionIds.length === 0) return; // not stood up yet — no-op
  // Seats per region: an explicit table (regional councils) or a fixed count
  // (governor = 1) overrides the chamber's per-region houseDistricts default.
  const seatsByRegion = new Map<string, number>(
    regions.map((r) => [
      r._id as string,
      opts?.seatsByRegion?.[r._id as string] ??
        opts?.seatsPerRegion ??
        (r as State).houseDistricts ??
        1,
    ])
  );

  // For a per-region chamber (regional councils), keep each region's
  // stateSenateSeats in step with the seat table so legislature pages and
  // elections agree on chamber size — mirrors ensureUKRegionalCouncilElections.
  if (opts?.seatsByRegion) {
    const seatSyncOps: AnyBulkWriteOperation<State>[] = Object.entries(opts.seatsByRegion).map(
      ([regionId, seats]) => ({
        updateOne: {
          filter: { _id: regionId, countryId, stateSenateSeats: { $ne: seats } },
          update: { $set: { stateSenateSeats: seats } },
        },
      })
    );
    if (seatSyncOps.length > 0) {
      await db.collection<State>("states").bulkWrite(seatSyncOps, { ordered: false });
    }
  }

  const chamber = electionType === "holyrood" || electionType === "senedd";
  const types = chamber ? [electionType, `snap_${electionType}`] : [electionType];
  const liveElections = await db
    .collection<Election>("elections")
    .find({ countryId, electionType: { $in: types }, status: { $in: ["active", "upcoming"] } })
    .toArray();
  const liveRegions = new Set(liveElections.map((e) => e.state));

  const completedElections = await db
    .collection<Election>("elections")
    .find({ countryId, electionType: { $in: types }, status: { $in: ["completed", "resolved"] } })
    .sort({ updatedAt: -1 })
    .toArray();
  const lastCompleted = (regionId: string): Election | undefined =>
    completedElections.find((e) => e.state === regionId);

  const toInsert: Omit<Election, "_id">[] = [];
  for (const regionId of regionIds) {
    if (liveRegions.has(regionId)) continue;
    const prev = lastCompleted(regionId);
    if (justResolvedInSameTurn(prev, now, currentTurn)) continue;
    const doc = buildCanonicalSpawn({
      electionType,
      countryId,
      state: regionId,
      prev,
      currentTurn,
      now,
      fallbackTotalSeats: seatsByRegion.get(regionId) ?? 1,
      ctx,
      freshStandup: true,
    });
    if (doc && chamber) {
      const plan = planNextLowerChamberCycle({
        countryId,
        electionType,
        snapType: `snap_${electionType}`,
        prev,
        currentTurn,
        ctx,
        endTimeToTurn: (endTime) => endTimeToLarpTurn(endTime, now, currentTurn),
      });
      if (!plan) continue;
      const duration = DEFAULT_DURATIONS[electionType];
      const startTurn = plan.spawn.endTurn - duration.durationHours;
      Object.assign(doc, {
        cycle: plan.spawn.cycle,
        electionYear: plan.electionYear,
        startTurn,
        startTime: turnToWallClock(startTurn, now, currentTurn),
        primaryEndTurn: plan.spawn.primaryEndTurn,
        primaryEndTime: turnToWallClock(plan.spawn.primaryEndTurn, now, currentTurn),
        endTurn: plan.spawn.endTurn,
        endTime: turnToWallClock(plan.spawn.endTurn, now, currentTurn),
        status: startTurn <= currentTurn ? "active" : "upcoming",
        ...(plan.shiftedScheduleEndTurn != null
          ? { shiftedScheduleEndTurn: plan.shiftedScheduleEndTurn }
          : {}),
      });
    }
    if (doc) toInsert.push(doc);
  }
  if (toInsert.length === 0) return;

  const orFilters = toInsert.map((e) => ({
    electionType: { $in: types },
    state: e.state,
    status: { $in: ["active", "upcoming"] as ElectionStatus[] },
  }));
  const existing = await db
    .collection<Election>("elections")
    .find({ countryId, $or: orFilters }, { projection: { state: 1 } })
    .toArray();
  const existingStates = new Set(existing.map((e) => e.state));
  const toActuallyInsert = toInsert.filter((e) => !existingStates.has(e.state));
  if (toActuallyInsert.length > 0) {
    await db
      .collection<Election>("elections")
      .insertMany(toActuallyInsert.map(withCampaignRules) as Election[]);
    console.log(
      `[Turn] ensureSecededChamberElections(${countryId}): spawned ${toActuallyInsert.length} ${electionType} election(s)`
    );
    sendBatchedElectionAnnouncements(toActuallyInsert, now);
  }
}

/**
 * Regional-council seats per macro-region = the real number of council areas
 * grouped into each (Scotland's 32 / Wales's 22 principal areas), driving the
 * per-region regionalCouncil chamber size at standup.
 */
export const SCO_REGIONAL_COUNCIL_SEATS = successorCouncilSeats("SCO");
export const WAL_REGIONAL_COUNCIL_SEATS = successorCouncilSeats("WAL");

/**
 * Per-region councillor seat allocation for the IE Local Council.
 * Distributed by population; 200 across the 8 NUTS-III regions, plus NIR's
 * allocation once it reunifies (population-proportional at the same ratio).
 * Mirrors the UK_REGIONAL_COUNCIL_SEATS pattern.
 */
export { IE_LOCAL_COUNCIL_SEATS };

/**
 * Shared spawner for direct-elected regional executive (the "governor"
 * electionType) in countries that aren't covered by `ensurePerpetualElections`
 * (which is US-only).
 *
 * Used by UK FMs + Mayor of London (SCO/WAL/NIR/LON) and JP regional
 * governors (all 8 regions). Same mechanical shape: single-seat, 4-year
 * cycle (192 turns via `CYCLE_TURNS.governor`), preset-anchored via
 * `electionToLarpYear`. Mirrors `ensureDEElections` for Bundestag.
 *
 * `allowedStateIds`, when provided, restricts spawning to that subset
 * (UK's English non-London regions get no FM/Mayor); when omitted every
 * state in the country is eligible (JP).
 */
export async function ensureRegionalGovernorElections(
  countryId: CountryId,
  now: Date,
  allowedStateIds?: ReadonlySet<string>,
  inFlightTurn?: number
): Promise<void> {
  const db = await getDb();
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;

  const states = await db
    .collection<State>("states")
    .find({ countryId }, { projection: { _id: 1 } })
    .toArray();
  const stateIds = states
    .map((s) => s._id as string)
    .filter((id) => !allowedStateIds || allowedStateIds.has(id));
  if (stateIds.length === 0) return;

  const liveElections = await db
    .collection<Election>("elections")
    .find({
      countryId,
      electionType: "governor",
      status: { $in: ["active", "upcoming"] },
    })
    .toArray();
  const liveGov = new Set(liveElections.map((e) => e.state));

  const completedElections = await db
    .collection<Election>("elections")
    .find({
      countryId,
      electionType: "governor",
      status: { $in: ["completed", "resolved"] },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  const ukInstitutions = usesUKDevolution(countryId)
    ? await reconcileUKDevolution(db, ctx.startingYear, completedElections, now)
    : null;

  function lastCompleted(stateId: string): Election | undefined {
    return completedElections.find((e) => e.state === stateId);
  }

  const dur = DEFAULT_DURATIONS.governor.durationHours;
  const genDur = getGeneralWindow("governor");

  const toInsert: Omit<Election, "_id">[] = [];

  for (const stateId of stateIds) {
    const institution = ukInstitutions?.regions[stateId as UKExecutiveRegion];
    if (ukInstitutions && !institution?.active) continue;
    if (liveGov.has(stateId)) continue;

    const prev = lastCompleted(stateId);

    // A region joining mid-cycle (NI reunifying → Cathaoirleach) syncs to a live
    // peer governor race so they resolve together, instead of opening its own.
    if (!ukInstitutions && !prev && liveElections[0]) {
      toInsert.push(mirrorPeerRaceTiming(countryId, liveElections[0], stateId, "governor", 1, now));
      continue;
    }

    const spawn = pickNextCanonicalCycle({
      electionType: "governor",
      countryId,
      prevCycle: Math.max(prev?.cycle ?? 0, institution ? institution.firstCycle - 1 : 0),
      currentTurn,
      priorEndTurn: null,
      customCycle1EndTurn: institution ? executiveCycleAnchor(institution, dur) : undefined,
      ctx:
        institution?.firstElectionEndTurn !== undefined
          ? { ...ctx, preIterationActive: false }
          : ctx,
    });
    if (!spawn) continue;

    const primaryEndTime = turnToWallClock(spawn.primaryEndTurn, now, currentTurn);
    const endTime = turnToWallClock(spawn.endTurn, now, currentTurn);

    toInsert.push({
      countryId,
      electionType: "governor",
      state: stateId,
      seatId: getSeatIdFromElection({ countryId, electionType: "governor", state: stateId }),
      cycle: spawn.cycle,
      electionYear:
        institution?.firstElectionEndTurn !== undefined
          ? yearOfTurn(spawn.endTurn, ctx.startingYear, {
              preIterationTurns: ctx.preIterationTurns,
            })
          : electionToLarpYear("governor", spawn.cycle, undefined, undefined, ctx, countryId),
      status: "active",
      totalSeats: 1,
      startTime: now,
      primaryEndTime,
      endTime,
      startTurn: currentTurn,
      primaryEndTurn: spawn.primaryEndTurn,
      endTurn: spawn.endTurn,
      durationHours: dur,
      primaryDurationHours: dur - genDur,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (toInsert.length === 0) return;

  // Guard against duplicates (same pattern as ensureDEElections).
  const orFilters = toInsert.map((e) => ({
    countryId,
    electionType: "governor" as const,
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
      `[Turn] ensureRegionalGovernorElections(${countryId}): spawned ${toActuallyInsert.length} missing governor election(s)`
    );
    sendBatchedElectionAnnouncements(toActuallyInsert, now);
  }
}

/** UK regions whose devolved executive is the "governor" electionType.
 *  English non-London regions get no FM/Mayor and are skipped. */
export const UK_GOVERNOR_REGIONS: ReadonlySet<string> = new Set(["SCO", "WAL", "NIR", "LON"]);

/**
 * Spawn a US presidential election if none is active or upcoming. Admin tool,
 * bypasses the turn-year check for recovery when the cron missed one.
 *
 * Uses `pickNextCanonicalCycle` so docs match cron-spawned ones (same `seatId`,
 * `electionYear`, times), falling back to `now`-anchored when the canonical
 * window eroded past the 24h+24h gate.
 *
 * Atomic via findOneAndUpdate + upsert + $setOnInsert; concurrent callers get
 * the existing doc with created=false.
 */
export async function ensurePresidentialElection(
  now: Date,
  inFlightTurn?: number
): Promise<{ message: string; electionId: string; created: boolean }> {
  const db = await getDb();
  const elections = db.collection<Election>("elections");

  // Compute the next cycle from the most recent completed/resolved race.
  // Doesn't need to be atomic — concurrent callers will compute the same
  // cycle; the upsert below ensures only one insertion actually lands.
  const latestPresident = await elections.findOne(
    { electionType: "president", countryId: "US", status: { $in: ["completed", "resolved"] } },
    { sort: { updatedAt: -1 } }
  );

  const dur = DEFAULT_DURATIONS.president.durationHours;
  const pdur = DEFAULT_DURATIONS.president.primaryDurationHours;
  const prevCycle = latestPresident?.cycle ?? 0;

  // Resolve canonical LARP timing for the next cycle. Falls back to a
  // now-anchored doc when the canonical window is unreachable (heavy admin
  // acceleration, far-past gate failure) so the recovery button still works.
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;
  const canonical = pickNextCanonicalCycle({
    electionType: "president",
    prevCycle,
    currentTurn,
    ctx,
  });

  let cycle: number;
  let startTime: Date;
  let primaryEndTime: Date;
  let endTime: Date;
  let startTurn: number;
  let primaryEndTurn: number;
  let endTurn: number;
  let status: "active" | "upcoming";
  if (canonical) {
    cycle = canonical.cycle;
    startTime = turnToWallClock(canonical.startTurn, now, currentTurn);
    primaryEndTime = turnToWallClock(canonical.primaryEndTurn, now, currentTurn);
    endTime = turnToWallClock(canonical.endTurn, now, currentTurn);
    startTurn = canonical.startTurn;
    primaryEndTurn = canonical.primaryEndTurn;
    endTurn = canonical.endTurn;
    status = canonical.startTurn <= currentTurn ? "active" : "upcoming";
  } else {
    cycle = prevCycle + 1;
    startTime = now;
    primaryEndTime = new Date(now.getTime() + pdur * 3_600_000);
    endTime = new Date(now.getTime() + dur * 3_600_000);
    startTurn = currentTurn;
    primaryEndTurn = currentTurn + pdur;
    endTurn = currentTurn + dur;
    status = "active";
  }

  const seatId = getSeatIdFromElection({
    countryId: "US",
    electionType: "president",
    state: "US",
  });
  const electionYear = electionToLarpYear("president", cycle, undefined, undefined, ctx);

  // findOneAndUpdate with upsert + $setOnInsert is atomic: if a matching
  // active/upcoming doc exists, it is returned and no insert happens;
  // otherwise a new doc is inserted with the $setOnInsert fields. With
  // returnDocument: "before", we get null on insert and the existing doc on hit.
  const previous = await elections.findOneAndUpdate(
    { electionType: "president", countryId: "US", status: { $in: ["active", "upcoming"] } },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        electionType: "president",
        state: "US",
        countryId: "US",
        seatId,
        cycle,
        electionYear,
        status,
        startTime,
        primaryEndTime,
        endTime,
        startTurn,
        primaryEndTurn,
        endTurn,
        durationHours: dur,
        primaryDurationHours: pdur,
        createdAt: now,
        updatedAt: now,
      } satisfies Election,
    },
    { upsert: true, returnDocument: "before" }
  );

  if (previous) {
    return {
      message: "A presidential election already exists.",
      electionId: previous._id.toString(),
      created: false,
    };
  }

  // No previous doc → the upsert just inserted. Read it back to return its _id.
  const inserted = await elections.findOne({
    electionType: "president",
    countryId: "US",
    status: { $in: ["active", "upcoming"] },
    cycle,
  });
  if (!inserted) {
    throw new Error("Failed to read back inserted presidential election");
  }
  return {
    message: "Presidential election spawned.",
    electionId: inserted._id.toString(),
    created: true,
  };
}

// ---------------------------------------------------------------------------
// Admin Spawn-Elections Registry
// ---------------------------------------------------------------------------
// Used by /api/admin/elections/spawn/[code] to dispatch the right ensure
// function per country. To add a country, export an ensure function above
// and add an entry here. The handler returns a short message plus optional
// metadata; the route normalizes the response envelope.
