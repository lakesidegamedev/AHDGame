import type { State } from "@/lib/db/types";
import { apportionSeats } from "@/lib/seeds/reference/rules/apportionSeats";
import { RU_ALL_AGE_CENSUS_2021 } from "./ruAdultCensus2021";

/** Russian Federation regions (2027) , presidential federation.
 *  National anchors: Rosstat 1 Jan 2025 population estimate (146,119,928)
 *  and revised 2024 nominal GDP (RUB 201,152,000 million).
 *  Regional figures are proportional estimates reconciled to those anchors,
 *  not published 2025 regional observations. Population shares come from the
 *  2021 Rosstat census macroregions, scaled to the national anchor by largest
 *  remainder (2021 shares held fixed). GDP shares follow the 1995 GRP weights.
 *  GDP is millions of rubles.
 *
 *  Same ten RSFSR economic-region ids as 1991 so Layer-1 census keys resolve.
 *  houseDistricts = Duma seats apportioned by population, largest remainder
 *  (sum = 450: 225 single-member + 225 party-list, 5% threshold).
 *  stateSenateSeats = Federation Council at 2 per federal subject (sum = 178
 *  for 89 subjects); a delegated seat ledger, not an electoral rule.
 *  votingSystem reads `fptp` like every 2027 bundle; the field cannot express
 *  a mixed system.
 */
const RU_2027_POPULATION: Record<string, number> = apportionSeats(
  146_119_928,
  RU_ALL_AGE_CENSUS_2021
);

const RU_2027_GDP_MRUB: Record<string, number> = {
  CEN: 42_165_006,
  NWR: 9_828_608,
  NOR: 10_812_687,
  CBE: 8_472_003,
  VOL: 30_270_591,
  NCA: 12_713_310,
  URA: 29_347_739,
  WSB: 31_211_081,
  ESB: 14_676_737,
  FEA: 11_654_238,
};

const RU_2027_SENATE_SEATS: Record<string, number> = {
  CEN: 26,
  NWR: 10,
  NOR: 12,
  CBE: 10,
  VOL: 26,
  NCA: 32,
  URA: 14,
  WSB: 18,
  ESB: 12,
  FEA: 18,
};

const RU_2027_NAMES: Record<string, { name: string; region: string }> = {
  CEN: { name: "Central Russia", region: "Russia" },
  NWR: { name: "Northwest Russia", region: "Russia" },
  NOR: { name: "European North", region: "Russia" },
  CBE: { name: "Central Black Earth", region: "Russia" },
  VOL: { name: "Volga", region: "Russia" },
  NCA: { name: "North Caucasus", region: "Russia" },
  URA: { name: "Urals", region: "Russia" },
  WSB: { name: "West Siberia", region: "Russia" },
  ESB: { name: "East Siberia", region: "Russia" },
  FEA: { name: "Russian Far East", region: "Russia" },
};

const dumaSeats = apportionSeats(450, RU_2027_POPULATION);

export const ruRegions2027: State[] = Object.keys(RU_2027_POPULATION).map((id) => ({
  _id: id,
  countryId: "RU",
  regionType: "state",
  name: RU_2027_NAMES[id].name,
  population: RU_2027_POPULATION[id],
  gdp: RU_2027_GDP_MRUB[id],
  houseDistricts: dumaSeats[id],
  stateSenateSeats: RU_2027_SENATE_SEATS[id],
  region: RU_2027_NAMES[id].region,
  votingSystem: "fptp",
}));

export default ruRegions2027;
