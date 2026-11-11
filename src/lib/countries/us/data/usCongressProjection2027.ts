/** January 2027 modeled opening from reported 2026 counts, not certified results.
 * Per-race uncertainty and fallback provenance live in us2026ResultsSnapshot.json.
 * The historical export name remains compatible with preset consumers.
 */
import snapshot from "./us2026ResultsSnapshot.json";
import { US_HOUSE_2027 } from "./usHouse2027";
import { US_SENATE_2027 } from "./usSenate2027";

const houseD = US_HOUSE_2027.filter((s) => s.party === "democrat").reduce(
  (n, s) => n + (s.seatsHeld ?? 1),
  0
);
const aligned = US_SENATE_2027.filter(
  (s) => s.party === "democrat" || s.party === "independent"
).length;
export const US_CONGRESS_PROJECTION_2027 = {
  snapshotDate: snapshot.capturedAt,
  basis: snapshot.status,
  house: { democrat: houseD, republican: 435 - houseD },
  senate: {
    democraticAligned: aligned,
    republican: 100 - aligned,
    controllingParty: aligned > 50 ? "democrat" : "republican",
    controlBasis: aligned === 50 ? "vice-presidential tie-break" : "provisional modeled majority",
  },
} as const;
