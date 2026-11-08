import type { AnyBulkWriteOperation } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import type { CycleAnchors } from "@/lib/elections/cycleAnchorContext";
import type { Election } from "@/lib/db/types";

/** What a region without a seat value gets: one seat, or an error that stops the phase. */
export type ChamberMissingSeats = "oneSeat" | "throw";

/**
 * When a seat value is present, overwrite seats inherited from the previous
 * cycle: `positive` for any value above 0, `multiSeat` only above 1.
 */
export type ChamberSeatEnforce = "positive" | "multiSeat";

export type ChamberSeatSource =
  /** Seats read from a numeric field on each region's state document. */
  | {
      kind: "stateField";
      field: "houseDistricts" | "stateSenateSeats";
      enforce?: ChamberSeatEnforce;
      missing: ChamberMissingSeats;
    }
  /** Seats read from a fixed per-region table. */
  | {
      kind: "table";
      table: Readonly<Record<string, number>>;
      enforce?: ChamberSeatEnforce;
      missing: ChamberMissingSeats;
    }
  /** Seats read from a per-region table chosen by the world's era preset. */
  | {
      kind: "presetTable";
      tableFor: (preset: string | undefined) => Readonly<Record<string, number>>;
      /** Seats one staggered class contests out of the region's table value. */
      perClass?: (regionSeats: number, chamberClass: 1 | 2) => number;
      enforce?: ChamberSeatEnforce;
      missing: ChamberMissingSeats;
    }
  /**
   * One seat in every constituency. `forceSeat` stamps one seat on every new race
   * instead of inheriting the previous cycle's count.
   */
  | { kind: "single"; forceSeat?: boolean };

/** Pure adjustments a country makes to a race the shell is about to insert or heal. */
export interface ChamberHooks {
  /** Final say on a new race, after seats are enforced. `extra` is what the shell caller passed in. */
  decorate?: (
    doc: Omit<Election, "_id">,
    args: { regionId: string; preset: string | undefined; extra: unknown }
  ) => Omit<Election, "_id">;
  /** Updates for races already running, on top of `healLiveSeats`. */
  healLive?: (
    live: readonly Election[],
    args: { preset: string | undefined; now: Date }
  ) => AnyBulkWriteOperation<Election>[];
}

export type ChamberElectoralSystem = "plurality" | "stv" | "twoRound" | "list" | "mixed";

export interface ChamberSpec {
  chamberId: string;
  countryId: CountryId;
  /** Election type stored on each election and the key into the canonical cycle table. */
  electionType: string;
  /** `regions` runs one election per state document, `nation` a single nationwide one. */
  constituencies: "regions" | "nation";
  seats: ChamberSeatSource;
  /** How the chamber is counted. Resolution reads the election type, not this field. */
  electoralSystem: ChamberElectoralSystem;
  /** Cycle-1 anchor each era preset supplies and the turns between cycles. */
  cycle: { anchor: keyof CycleAnchors; periodHours: number };
  /** `countryLive` spawns only while the country is beta or active. */
  gate: "countryLive" | "always";
  /** A region with no history that joins mid-cycle either copies the live race or starts its own. */
  lateJoiners: "mirrorLivePeer" | "ownCycle";
  openPrimaryImmediately: boolean;
  /**
   * `shiftsCycle`: a called snap election moves the next regular race's date and
   * a live snap holds the regular back. Snaps are the `snap_<electionType>` family.
   */
  snap: "none" | "shiftsCycle";
  /** Correct the seat count of races already running when the region data changes. */
  healLiveSeats: boolean;
  /** `none` means no off-cycle seat contest exists for this chamber. */
  byElections: "none" | "special";
  /**
   * Staggered half-elections: each class runs its own cycle off its own anchor
   * and contests its share of every region's seats. `cycle.anchor` is class 1's.
   */
  classes?: { anchors: Readonly<Record<1 | 2, keyof CycleAnchors>> };
  /**
   * Cycle-1 end turn per region, replacing the preset anchor. A region it
   * returns nothing for makes the spawner throw.
   */
  regionAnchor?: (regionId: string, preset: string | undefined) => number | undefined;
  /** Spawn without the batched Discord announcement. */
  silent?: boolean;
  hooks?: ChamberHooks;
}

const SEAT_KINDS = ["stateField", "table", "presetTable", "single"] as const;
const SYSTEMS: readonly ChamberElectoralSystem[] = [
  "plurality",
  "stv",
  "twoRound",
  "list",
  "mixed",
];

/** Validate a spec and return it. A missing or inconsistent value throws; nothing falls back. */
export function defineChamberSpec(spec: ChamberSpec): Readonly<ChamberSpec> {
  const fail = (why: string): never => {
    throw new Error(`Invalid chamber spec ${spec.countryId}/${spec.chamberId}: ${why}`);
  };
  if (!spec.chamberId) fail("chamberId is required");
  if (!spec.countryId) fail("countryId is required");
  if (!spec.electionType) fail("electionType is required");
  if (!DEFAULT_DURATIONS[spec.electionType]) {
    fail(`no election durations for type "${spec.electionType}"`);
  }
  if (spec.constituencies !== "regions" && spec.constituencies !== "nation") {
    fail("constituencies must be regions or nation");
  }
  if (!spec.seats || !SEAT_KINDS.includes(spec.seats.kind)) fail("seats source is required");
  if (spec.seats.kind === "table" && Object.keys(spec.seats.table).length === 0) {
    fail("seat table is empty");
  }
  if (
    spec.seats.kind !== "single" &&
    spec.seats.missing !== "oneSeat" &&
    spec.seats.missing !== "throw"
  ) {
    fail("seats.missing is required");
  }
  if (spec.constituencies === "nation" && spec.seats.kind !== "single") {
    fail("a nationwide chamber must use a single seat");
  }
  if (!SYSTEMS.includes(spec.electoralSystem)) fail("electoralSystem is required");
  if (!spec.cycle?.anchor) fail("cycle.anchor is required");
  if (!Number.isInteger(spec.cycle.periodHours) || spec.cycle.periodHours <= 0) {
    fail("cycle.periodHours must be a positive integer");
  }
  if (spec.gate !== "countryLive" && spec.gate !== "always") fail("gate is required");
  if (spec.lateJoiners !== "mirrorLivePeer" && spec.lateJoiners !== "ownCycle") {
    fail("lateJoiners is required");
  }
  if (spec.lateJoiners === "mirrorLivePeer" && spec.constituencies === "nation") {
    fail("a nationwide chamber has no late joiners to mirror");
  }
  if (typeof spec.openPrimaryImmediately !== "boolean") fail("openPrimaryImmediately is required");
  if (spec.snap !== "none" && spec.snap !== "shiftsCycle") fail("snap is required");
  if (typeof spec.healLiveSeats !== "boolean") fail("healLiveSeats is required");
  if (spec.snap === "shiftsCycle" && spec.constituencies === "nation") {
    fail("a nationwide chamber cannot shift its cycle on a snap");
  }
  if (spec.classes && spec.classes.anchors[1] !== spec.cycle.anchor) {
    fail("cycle.anchor must be the class 1 anchor");
  }
  if (spec.classes && (!spec.classes.anchors[1] || !spec.classes.anchors[2])) {
    fail("both class anchors are required");
  }
  if (spec.classes && (spec.constituencies === "nation" || spec.snap === "shiftsCycle")) {
    fail("a staggered chamber is regional and has no snap");
  }
  if (spec.classes && spec.seats.kind !== "presetTable") {
    fail("a staggered chamber needs a preset table to split between classes");
  }
  if (spec.healLiveSeats && spec.seats.kind === "single") {
    fail("a single-seat chamber has no seat count to heal");
  }
  if (spec.byElections !== "none" && spec.byElections !== "special") {
    fail("byElections is required");
  }
  return Object.freeze({ ...spec });
}

/** Seats for one region, or throw if the spec cannot supply them. */
export function seatsForRegion(
  spec: ChamberSpec,
  regionId: string,
  state: { houseDistricts?: number; stateSenateSeats?: number } | undefined,
  preset?: string,
  chamberClass?: 1 | 2
): number {
  const source = spec.seats;
  if (source.kind === "single") return 1;
  if (source.kind === "table" || source.kind === "presetTable") {
    const table = source.kind === "table" ? source.table : source.tableFor(preset);
    const seats = table[regionId];
    if (typeof seats === "number") {
      return source.kind === "presetTable" && source.perClass && chamberClass
        ? source.perClass(seats, chamberClass)
        : seats;
    }
    if (source.missing === "oneSeat") return 1;
    throw new Error(
      `Chamber ${spec.countryId}/${spec.chamberId} has no seat entry for ${regionId}`
    );
  }
  const seats = state?.[source.field];
  if (typeof seats === "number") return seats;
  if (source.missing === "oneSeat") return 1;
  throw new Error(
    `Chamber ${spec.countryId}/${spec.chamberId} region ${regionId} is missing ${source.field}`
  );
}
