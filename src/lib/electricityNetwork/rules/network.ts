/** Aggregate grid zones and commissioned interconnectors; electricity has no sea-freight fallback. */
import type { ElectricityNetwork, ElectricityNetworkMode, GridLocation, GridLink } from "./types";
export const GRID_VERSION = "electricity-2027-v1";
const SOURCE = "https://www.entsoe.eu/data/map/";
const links: readonly [string, string, number, number, string?][] = [
  [
    "US",
    "CA",
    20000,
    1909,
    "https://www.cer-rec.gc.ca/en/data-analysis/energy-commodities/electricity/",
  ],
  ["US", "MX", 1500, 1905],
  ["UK", "SCO", 6000, 1953],
  ["UK", "WAL", 6000, 1953],
  ["FR", "DE", 3000, 1953],
  ["FR", "BE", 3000, 1953],
  ["BE", "NL", 2500, 1953],
  ["NL", "DE", 4000, 1953],
  ["DE", "AT", 5000, 1953],
  ["FR", "CH", 3000, 1953],
  ["CH", "IT", 3000, 1953],
  ["AT", "IT", 1000, 1953],
  ["FR", "IT", 3000, 1953],
  ["FR", "ES", 2800, 1959],
  ["ES", "PT", 3000, 1953],
  ["DE", "DK", 2000, 1965],
  ["DK", "SE", 1900, 1915],
  ["SE", "NO", 3000, 1963],
  ["SE", "FI", 2700, 1959],
  ["DE", "PL", 2000, 1995],
  ["DE", "CZ", 2000, 1953],
  ["CZ", "SK", 2000, 1953],
  ["AT", "HU", 1000, 1953],
  ["SK", "HU", 2000, 1953],
  ["HU", "RO", 1500, 1953],
  ["RO", "BG", 1000, 1953],
  ["BG", "GR", 1000, 1971],
  ["GR", "TR", 550, 2015],
  ["AT", "SI", 1000, 1953],
  ["SI", "HR", 1000, 1953],
  ["HR", "RS", 1000, 1953],
  ["RS", "BA", 1000, 1953],
  ["RS", "ME", 1000, 1953],
  ["RS", "MK", 1000, 1953],
  ["ME", "AL", 1000, 1973],
  ["GR", "AL", 400, 1973],
  [
    "UK",
    "FR",
    2000,
    1986,
    "https://www.nationalgrid.com/national-grid-ventures/interconnectors-connecting-cleaner-future",
  ],
  ["UK", "IE", 500, 2012],
  ["UK", "NL", 1000, 2011],
  ["UK", "BE", 1000, 2019],
  ["UK", "NO", 1400, 2021],
  ["UK", "DK", 1400, 2023],
  ["FI", "EE", 1000, 2006],
  ["EE", "LV", 1000, 2025],
  ["LV", "LT", 1000, 2025],
  ["LT", "PL", 500, 2015],
  ["LT", "SE", 700, 2016],
  ["RU", "CN", 750, 2012],
  ["BR", "AR", 2000, 2000],
  ["BR", "PY", 6000, 1984],
  ["BR", "UY", 500, 2001],
  ["NG", "BJ", 200, 2007],
];
export function gridZone(location: GridLocation): string | null {
  const c = location.countryId?.trim().toUpperCase();
  if (!c) return null;
  const raw = (location.stateId ?? "").toUpperCase();
  const s = raw.startsWith(`${c}_`) || raw.startsWith(`${c}-`) ? raw.slice(c.length + 1) : raw;
  if (c === "US" && (s === "AK" || s === "HI")) return `${c}:${s}`;
  if (c === "CA" && ["NU", "NT", "YT", "NL"].includes(s)) return `CA:${s}`;
  if (c === "UK" && ["NIR", "NI"].includes(s)) return "UK:NIR";
  return c;
}
export function buildElectricityNetwork(
  year: number,
  mode: ElectricityNetworkMode
): ElectricityNetwork {
  if (!Number.isSafeInteger(year) || year < 1800 || year > 2500)
    throw Error("Invalid electricity network year");
  const enabled: GridLink[] = links
    .filter(([, , , start]) => year >= start)
    .map(([from, to, capacity, , source]) => ({
      id: `${from}-${to}`,
      from,
      to,
      capacity,
      loss: 0.03,
      name: `${from} / ${to}`,
      source: source ?? SOURCE,
    }));
  if (year >= 2021)
    enabled.push({
      id: "IFA2",
      from: "UK",
      to: "FR",
      capacity: 1000,
      loss: 0.03,
      name: "IFA2",
      source:
        "https://www.rte-france.com/projets/nos-projets/ifa-2-la-nouvelle-interconnexion-france-angleterre",
    });
  if (year >= 2025)
    enabled.push({
      id: "Greenlink",
      from: "UK",
      to: "IE",
      capacity: 500,
      loss: 0.03,
      name: "Greenlink",
      source: "https://www.eirgrid.ie/industry/interconnection",
    });
  if (year >= 2017)
    enabled.push({
      id: "CA-NL",
      from: "CA",
      to: "CA:NL",
      capacity: 900,
      loss: 0.05,
      name: "Labrador / Newfoundland",
      source: "https://muskratfalls.nalcorenergy.com/",
    });
  if (year >= 2002)
    enabled.push({
      id: "UK-NIR",
      from: "UK",
      to: "UK:NIR",
      capacity: 500,
      loss: 0.03,
      name: "Moyle",
      source: "https://www.mutual-energy.com/",
    });
  if (year >= 1995)
    enabled.push({
      id: "IE-NIR",
      from: "IE",
      to: "UK:NIR",
      capacity: 300,
      loss: 0.02,
      name: "Ireland north / south",
      source: SOURCE,
    });
  return {
    version: GRID_VERSION,
    year,
    mode,
    links: enabled,
    notes: [
      "National grids are aggregate zones. Alaska, Hawaii and northern Canadian territories are isolated; Newfoundland and Northern Ireland use named links.",
      "Limits are modeled MWh per accounting turn (one twenty-fourth of an economic day), shared in both directions. Domestic bottlenecks inside each aggregate zone are not modeled.",
      "The starter catalog uses approximate aggregate transfer limits and commissioning years, not an engineering-certified historical grid. Link losses are modeled, not measured cable losses.",
      "Natural gas is unaffected. Electricity cannot use a sea-freight fallback.",
    ],
  };
}
