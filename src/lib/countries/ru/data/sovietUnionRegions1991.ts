import type { State } from "@/lib/db/types";
import { SOVIET_REPUBLIC_REFERENCE_1990 } from "@/lib/seeds/reference/sovietRepublics1990";
import { SUCCESSOR_NOMINAL_GDP_1991 } from "@/lib/seeds/reference/successorGdp1991";
import { apportionSeats } from "@/lib/seeds/reference/rules/apportionSeats";
import { ruRegions1991 } from "./ruRegions1991";

/**
 * RU slot represents the whole USSR at the 1991 opening. Ten RSFSR
 * regions keep 1991 anchors; other republics are bounded aggregates with
 * Jan 1990 populations and a 1988 NMP-share proxy output, not observed
 * 1991 republic GDP. The 1989 Congress's 2,250 seats are approximated by
 * population across one regional ledger; do not present as the historical map.
 */
const republicRows = Object.entries(SOVIET_REPUBLIC_REFERENCE_1990).filter(
  ([entityId]) => entityId !== "RU"
);
const russianGdpMillionRub = SUCCESSOR_NOMINAL_GDP_1991.RU / 1_000_000;

const republicRegions: State[] = republicRows.map(([entityId, reference]) => ({
  _id: `SU_${entityId}`,
  countryId: "RU",
  regionType: "state",
  name: reference.name,
  region: "Union republics",
  population: reference.population,
  gdp: (russianGdpMillionRub * reference.nmpShareBps) / 6_110,
  houseDistricts: 0,
  stateSenateSeats: 0,
  votingSystem: "fptp",
}));

const populations = Object.fromEntries(
  [...ruRegions1991, ...republicRegions].map((region) => [region._id, region.population])
);
const seats = apportionSeats(2_250, populations);

export const sovietUnionRegions1991: State[] = [...ruRegions1991, ...republicRegions].map(
  (region) => ({ ...region, houseDistricts: seats[region._id], stateSenateSeats: 0 })
);

export const SOVIET_UNION_1991_POPULATION = sovietUnionRegions1991.reduce(
  (total, region) => total + region.population,
  0
);

export const SOVIET_UNION_1991_GDP_MILLION_RUB = sovietUnionRegions1991.reduce(
  (total, region) => total + region.gdp,
  0
);
