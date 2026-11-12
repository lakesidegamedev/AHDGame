import type { State } from "@/lib/db/types";

/**
 * Quebec's eight successor regions, each a group of whole administrative
 * regions. Independence inserts them and apportions the live CA_QC province
 * across them, so these figures are weights; they sum to the CA_QC 2027 seed.
 * Population: ISQ 2023 estimates scaled to the province. GDP: rounded ISQ
 * regional shares. Seats: the 125-seat Assembly apportioned by population.
 */
export const qcRegions: State[] = [
  {
    _id: "QC_MTL",
    countryId: "QC",
    regionType: "region",
    name: "Montreal",
    population: 2_133_000,
    gdp: 221_500,
    houseDistricts: 29,
    stateSenateSeats: 0,
    region: "Greater Montreal",
    votingSystem: "fptp",
  },
  {
    _id: "QC_LLL",
    countryId: "QC",
    regionType: "region",
    name: "Laval, Laurentides and Lanaudiere",
    population: 1_684_000,
    gdp: 91_750,
    houseDistricts: 23,
    stateSenateSeats: 0,
    region: "Greater Montreal",
    votingSystem: "fptp",
  },
  {
    _id: "QC_MON",
    countryId: "QC",
    regionType: "region",
    name: "Monteregie",
    population: 1_675_000,
    gdp: 107_590,
    houseDistricts: 23,
    stateSenateSeats: 0,
    region: "Greater Montreal",
    votingSystem: "fptp",
  },
  {
    _id: "QC_CAP",
    countryId: "QC",
    regionType: "region",
    name: "Capitale-Nationale and Chaudiere-Appalaches",
    population: 1_250_000,
    gdp: 94_940,
    houseDistricts: 17,
    stateSenateSeats: 0,
    region: "Quebec City",
    votingSystem: "fptp",
  },
  {
    _id: "QC_EST",
    countryId: "QC",
    regionType: "region",
    name: "Estrie and Centre-du-Quebec",
    population: 789_000,
    gdp: 46_200,
    houseDistricts: 11,
    stateSenateSeats: 0,
    region: "South",
    votingSystem: "fptp",
  },
  {
    _id: "QC_OUT",
    countryId: "QC",
    regionType: "region",
    name: "Outaouais and Abitibi-Temiscamingue",
    population: 576_000,
    gdp: 39_890,
    houseDistricts: 8,
    stateSenateSeats: 0,
    region: "West",
    votingSystem: "fptp",
  },
  {
    _id: "QC_MSL",
    countryId: "QC",
    regionType: "region",
    name: "Mauricie and Saguenay-Lac-Saint-Jean",
    population: 574_000,
    gdp: 39_220,
    houseDistricts: 8,
    stateSenateSeats: 0,
    region: "Centre",
    votingSystem: "fptp",
  },
  {
    _id: "QC_ENQ",
    countryId: "QC",
    regionType: "region",
    name: "Eastern and Northern Quebec",
    population: 439_000,
    gdp: 38_560,
    houseDistricts: 6,
    stateSenateSeats: 0,
    region: "East and North",
    votingSystem: "fptp",
  },
];

/** Regional-council seats per region: 100 seats apportioned by population. */
export const QC_REGIONAL_COUNCIL_SEATS: Readonly<Record<string, number>> = {
  QC_MTL: 23,
  QC_LLL: 19,
  QC_MON: 18,
  QC_CAP: 14,
  QC_EST: 9,
  QC_OUT: 6,
  QC_MSL: 6,
  QC_ENQ: 5,
};

/** Quebec City sits in Capitale-Nationale. */
export const QC_CAPITAL_REGION = "QC_CAP";
