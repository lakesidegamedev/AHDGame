/**
 * What a measured room-to-build figure means for the decision to build. One
 * reading shared by the new-sector dialog, the sector Expand dialog and the
 * sector page, so none of them can rank, praise or contradict a market the
 * others call closed.
 */
export type BuildRoomVerdict = "room" | "none" | "unknown";

/** Capacity units per day of unmet buyer demand, or null when not measured. */
export function buildRoomVerdict(roomUnits: number | null | undefined): BuildRoomVerdict {
  if (roomUnits == null || !Number.isFinite(roomUnits)) return "unknown";
  return roomUnits > 0 ? "room" : "none";
}
