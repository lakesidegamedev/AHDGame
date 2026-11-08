import type { CountryId } from "@/lib/constants/countries";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import type { CycleAnchors } from "@/lib/elections/cycleAnchorContext";

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
      enforce?: ChamberSeatEnforce;
      missing: ChamberMissingSeats;
    }
  /**
   * One seat in every constituency. `forceSeat` stamps one seat on every new race
   * instead of inheriting the previous cycle's count.
   */
  | { kind: "single"; forceSeat?: boolean };

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
  if (spec.snap === "shiftsCycle" && !spec.openPrimaryImmediately) {
    fail("a snap-shifted chamber always opens its primary immediately");
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
  preset?: string
): number {
  const source = spec.seats;
  if (source.kind === "single") return 1;
  if (source.kind === "table" || source.kind === "presetTable") {
    const table = source.kind === "table" ? source.table : source.tableFor(preset);
    const seats = table[regionId];
    if (typeof seats === "number") return seats;
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
