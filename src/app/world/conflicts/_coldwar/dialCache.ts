import { writePersistedNumber } from "./persisted";
import type { ColdWarDials } from "@/lib/coldwar/dials";

/**
 * localStorage keys the Cold War console's boards read their dials from, and
 * the one writer that fills them from the server.
 *
 * These keys are consumed by the DEFCON readout, the detente board's stand-down
 * gate, the home front metric computation, the proxy-war supply model and the
 * crisis board's credibility multiplier, so writing them is not decoration.
 *
 * They are a CACHE: the server reading is the source of truth and overwrites
 * them on every section load (see ColdWarDialHydrator). A board's in-session
 * adjustment survives until the next load.
 */
export const CW_DIAL_KEYS = {
  defcon: "ahd_defcon",
  westCohesion: "ahd_west_cohesion",
  eastCohesion: "ahd_east_cohesion",
} as const;

/** Fill the cache from a server reading. The only writer of these three keys. */
export function writeColdWarDialCache(
  dials: Pick<ColdWarDials, "defcon" | "cohesionWest" | "cohesionEast">
): void {
  writePersistedNumber(CW_DIAL_KEYS.defcon, dials.defcon);
  writePersistedNumber(CW_DIAL_KEYS.westCohesion, dials.cohesionWest);
  writePersistedNumber(CW_DIAL_KEYS.eastCohesion, dials.cohesionEast);
}
