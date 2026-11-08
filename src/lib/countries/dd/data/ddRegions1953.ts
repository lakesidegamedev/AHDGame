import type { State } from "@/lib/db/types";

/**
 * GDR regions for 1953. Authored directly for this era; do not derive from
 * another era's bundle. Codes reuse the eastern-Länder set shared with the 1979
 * bundle (Länder are gameplay units; Bezirke are flavor). Codes belong to DE
 * only in unified eras. houseDistricts = Volkskammer seats (nominal, sum 500),
 * stateSenateSeats = Landtag seats (sum 80), gdp in millions of Mark der DDR.
 */
export const ddRegions1953: State[] = [
  // ── Berlin (the capital, SED stronghold, June 17 epicentre) ─────────────────
  {
    _id: "BEO",
    countryId: "DD",
    regionType: "state",
    name: "Berlin (Ost)",
    population: 1_190_000, // East Berlin 1953 (pre-Wall, still shrinking from 1.8M wartime)
    gdp: 5_200,
    houseDistricts: 32,
    stateSenateSeats: 5,
    region: "Berlin",
    votingSystem: "fptp",
  },
  // ── North (Baltic coast + Brandenburg + Saxony-Anhalt) ──────────────────────
  {
    _id: "MV",
    countryId: "DD",
    regionType: "state",
    name: "Mecklenburg-Vorpommern",
    population: 2_120_000, // swollen by expellee resettlement; agrarian Baltic coast
    gdp: 3_900,
    houseDistricts: 58,
    stateSenateSeats: 9,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "BB",
    countryId: "DD",
    regionType: "state",
    name: "Brandenburg",
    population: 2_620_000, // excl. Berlin; Bezirke Potsdam/Frankfurt(Oder)/Cottbus
    gdp: 5_600,
    houseDistricts: 71,
    stateSenateSeats: 11,
    region: "North",
    votingSystem: "fptp",
  },
  {
    _id: "ST",
    countryId: "DD",
    regionType: "state",
    name: "Sachsen-Anhalt",
    population: 4_120_000, // Halle/Magdeburg — the chemical belt
    gdp: 9_900,
    houseDistricts: 112,
    stateSenateSeats: 18,
    region: "North",
    votingSystem: "fptp",
  },
  // ── South (the industrial heartland) ────────────────────────────────────────
  {
    _id: "SN",
    countryId: "DD",
    regionType: "state",
    name: "Sachsen",
    population: 5_560_000, // Dresden/Leipzig/Karl-Marx-Stadt industrial core
    gdp: 13_900,
    houseDistricts: 151,
    stateSenateSeats: 24,
    region: "South",
    votingSystem: "fptp",
  },
  {
    _id: "TH",
    countryId: "DD",
    regionType: "state",
    name: "Thüringen",
    population: 2_790_000, // Erfurt/Gera/Suhl; Wismut uranium fields
    gdp: 5_500,
    houseDistricts: 76,
    stateSenateSeats: 13,
    region: "South",
    votingSystem: "fptp",
  },
];

export default ddRegions1953;
