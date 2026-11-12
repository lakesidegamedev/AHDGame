/**
 * SEED INDEPENDENCE: do not derive from another era's data.
 * Type-only imports are allowed.
 *
 * Nigeria's 6 geopolitical zones for the 1979 Second Republic preset.
 * gdp is in NGN millions, tunable scale.
 *
 * Only era-scaled regions are modelled here. The historical 19-state
 * structure and five-party system are out of scope.
 */
import type { State } from "@/lib/db/types";

export const ngRegions1979: State[] = [
  {
    _id: "NORTH_WEST",
    countryId: "NG",
    regionType: "state",
    name: "North-West",
    population: 18_500_000,
    gdp: 24_000_000,
    houseDistricts: 95,
    stateSenateSeats: 21,
    region: "North-West",
    votingSystem: "fptp",
  },
  {
    _id: "NORTH_EAST",
    countryId: "NG",
    regionType: "state",
    name: "North-East",
    population: 9_500_000,
    gdp: 15_000_000,
    houseDistricts: 50,
    stateSenateSeats: 18,
    region: "North-East",
    votingSystem: "fptp",
  },
  {
    _id: "NORTH_CENTRAL",
    countryId: "NG",
    regionType: "state",
    name: "North-Central",
    population: 10_000_000,
    gdp: 19_000_000,
    houseDistricts: 53,
    stateSenateSeats: 18,
    region: "North-Central",
    votingSystem: "fptp",
  },
  {
    _id: "SOUTH_WEST",
    countryId: "NG",
    regionType: "state",
    name: "South-West",
    population: 14_000_000,
    gdp: 40_000_000,
    houseDistricts: 72,
    stateSenateSeats: 18,
    region: "South-West",
    votingSystem: "fptp",
  },
  {
    _id: "SOUTH_SOUTH",
    countryId: "NG",
    regionType: "state",
    name: "South-South",
    population: 10_500_000,
    gdp: 34_000_000,
    houseDistricts: 47,
    stateSenateSeats: 18,
    region: "South-South",
    votingSystem: "fptp",
  },
  {
    _id: "SOUTH_EAST",
    countryId: "NG",
    regionType: "state",
    name: "South-East",
    population: 8_500_000,
    gdp: 18_000_000,
    houseDistricts: 43,
    stateSenateSeats: 16,
    region: "South-East",
    votingSystem: "fptp",
  },
];

export default ngRegions1979;
