import { getDb } from "@/lib/mongodb";
import {
  ddElectionsLive,
  ensureRegionalDelegateElections,
  ensureRegionalGovernorElections,
  seatsFromRegionField,
} from "@/lib/elections/scheduling/shared";

/**
 * DD Volkskammer: the GDR's unicameral chamber, elected as a single National
 * Front list per macro-region (1953) / Land (1979). One multi-seat regional
 * delegate election per region, seats from the live `houseDistricts`.
 *
 * Size from the live region docs, not the seed total: the chamber can be
 * resized (reunification grew it to 693) and a stale magnitude would keep
 * electing too few seats. Mirrors `ensureRUSupremeSovietElections`.
 */
export async function ensureDDVolkskammerElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "DD",
      electionType: "volkskammerDeputy",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "houseDistricts"),
      openPrimaryImmediately: true,
      statusGated: true,
      label: "Volkskammer",
    },
    now,
    inFlightTurn
  );
}

/**
 * Land First Secretaries — the shared governor family with the Volkskammer
 * anchor override (threaded via countryId in canonicalCycle, mirroring RU's
 * republic-soviet ride-along). The shared helper has no status gate, so the
 * DD wrapper adds it (the RU pattern).
 */
export async function ensureDDGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  const db = await getDb();
  if (!(await ddElectionsLive(db))) return;
  await ensureRegionalGovernorElections("DD", now, undefined, inFlightTurn);
}

/**
 * Land assemblies (Landtage) , each Land's authored chamber size
 * (`stateSenateSeats` on the seeded State doc). Without this family, Land
 * First Secretaries have no same-party legislature NPPs to queue state bills
 * through. Mirrors `ensureRURepublicSovietElections`.
 */
export async function ensureDDLandAssemblyElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "DD",
      electionType: "landAssembly",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "stateSenateSeats"),
      openPrimaryImmediately: true,
      statusGated: true,
      electionsLiveGate: ddElectionsLive,
      label: "Landtag",
    },
    now,
    inFlightTurn
  );
}
