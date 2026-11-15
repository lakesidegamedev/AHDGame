import type { CrisisKind } from "@/lib/crises/rules/boardView";

/**
 * Representative photos for crisis types (Wikimedia Commons through the stable
 * Special:FilePath redirect). Scenery, places and objects only: no politicians,
 * no identifiable people, nothing graphic.
 */
const fp = (file: string, width = 640) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

export const CRISIS_IMAGE_FILES = {
  // Hayes Fire flames and smoke. Public domain.
  wildfire:
    "Hayes Fire Flames and Smoke, Olympic - 2016 (32275dd6-5c88-4fa0-b4d3-54b769754792).jpg",
  // Brisbane River in flood. CC BY-SA 4.0.
  flood: "Brisbane River Town Reach in flood from Story Bridge Fortitude Valley P1090906.jpg",
  // Collapsed apartment building, Northridge. Public domain.
  earthquake: "Partially collapsed apartment building, 1994 Northridge Earthquake.jpg",
  // Hurricane Isabel from the ISS. Public domain.
  hurricane: "Hurricane Isabel from ISS.jpg",
  // Tornado family at dusk. CC BY-SA 4.0.
  tornado: "Evolution of a Tornado.jpg",
  // Aerial view of Otsuchi after the tsunami. Public domain.
  tsunami:
    "US Navy 110315-N-5503T-307 An aerial view of damage to Otsuchi, Japan, after a 9.0 magnitude earthquake and subsequent tsunami devastated the area in northern Japan.jpg",
  // Ash and steam plume, Soufriere Hills. Public domain.
  volcano: "Ash and Steam Plume, Soufriere Hills Volcano, Montserrat.jpg",
  // Cracked dry earth. CC BY-SA 4.0.
  drought: "Dry land (cracked) 7.jpg",
  // Snow storm over the Don river. CC BY 4.0.
  winter: "Snow storm, Snowing, Don River in ice, Rostov-on-Don, Winter in Russia.jpg",
  // Pharmacy sign reading 42 degrees. CC BY-SA 4.0.
  heat: "Termometro 42 grados.jpg",
  // Landslide on Kentucky Route 8. CC0.
  landslide: "Landslide on Kentucky Route 8.jpg",
  // Siachen glacier avalanche. CC BY-SA 4.0.
  avalanche: "2012 Siachen Glacier avalanche 01.JPG",
  // Haboob in Cimarron County. CC BY-SA 4.0.
  dust: "Approaching dust storm (haboob), Cimarron County, OK.jpg",
  // Field of hailstones. Public domain.
  hail: "A field of hailstones.jpg",
  // First National Bank Building, Portland. CC BY-SA 4.0.
  bank: "Main facade of First National Bank Building in Portland (2018).jpg",
  // New York Stock Exchange sign. CC0.
  markets: "Sign of the New York Stock Exchange, Broad Street.jpg",
  // Closed shop shutters. CC0.
  recession: "20110501MacauShopClosed.jpg",
  // Fuel price sign. CC BY 2.0.
  prices: "Gas Prices Sign - Yes Way Gas Station - Fort Pierre - South Dakota.jpg",
  // Empty supermarket shelves. CC BY-SA 4.0.
  shortage: "2020-03-15 Empty supermarket shelves in Australian supermarket 01.jpg",
  // Container cranes, Port of Oakland. CC BY-SA 4.0.
  port: "Container cranes at the Port of Oakland.jpg",
  // Container ship in port. CC BY-SA 4.0.
  shipping: "MSC HARMONY III (container ship, 2006) in Port Koper (SIKOP, 2024).jpg",
  // Picket sign, Brookside mine strike. Public domain.
  strike:
    "CLOSEUP OF A PICKET SIGN MADE BY MINERS ON STRIKE AGAINST THE BROOKSIDE MINE COMPANY IN BROOKSIDE, KENTUCKY, NEAR... - NARA - 556545.jpg",
  // Protesters with signs, 2011. CC BY-SA 2.0.
  protest: "Crowd of protesters holding signs during the 2011 Egyptian Revolution (1).jpg",
  // Tampere after the civil war. Public domain.
  war: "Tampere destroyed in Civil War.jpg",
  // Ethernet switches and patch panels. CC BY-SA 4.0.
  cyber: "19-inch rackmount Ethernet switches and patch panels.jpg",
  // High-voltage anchor pylon. CC0.
  power: "Anchor pylon of high-voltage overhead power line 750 kV.jpg",
  // Power outage after Sandy. CC BY-SA 2.0.
  blackout: "Sandy Poweroutage 1.jpg",
  // Nuclear power plant cooling towers. CC BY-SA 4.0.
  nuclear: "Cooling towers of a nuclear power plant.jpg",
  // Refugee camp tents, Thessaloniki. CC BY-SA 4.0.
  refugees: "View of the tents of Thessaloniki port refugee camp.jpg",
  // SARS-CoV-2 electron micrograph. CC BY 2.0.
  pandemic: "SARS-CoV-2 scanning electron microscope image.jpg",
  // Hospital corridor. CC0.
  hospital: "Corridor on the second level - NÄL hospital 1.jpg",
  // Hungarian Parliament Building. CC0.
  government: "Hungarian Parliament Building 2023-9.jpg",
  // Presidential Palace, Paramaribo. CC BY 2.0.
  coup: "Presidential Palace - Paramaribo.jpg",
  // Fire crew at burned oil tanks. Public domain.
  industrial:
    "FEMA - 42401 - Fire crew at the burned out oil tanks after the refinery explosion in Puerto Rico.jpg",
  // Wreckage from the Key Bridge collapse. Public domain.
  bridge: "Wreckage from Key Bridge Collapse (240326-A-SE916-9511).jpg",
  // Low water at a reservoir. CC BY-SA 4.0.
  water: "Yesa - Embalse - Sequía 01.jpg",
  // Bark beetle forest damage. CC0.
  pest: "Bark beetle - destruction of forest.jpg",
  // Unfinished houses. CC BY-SA 2.0.
  housing: "Unfinished houses on the Lodge Meadow Estate, Hilltown - geograph.org.uk - 4084319.jpg",
  // G5 aurora over Sweden. CC BY-SA 4.0.
  solar: "G5 aurora over Tuntorp, Lysekil Municipality 15.jpg",
  // Satellites and debris in Earth orbit. Public domain.
  orbit:
    "Tracking Satellites and Space Debris in Earth Orbit (Feb 2024) (SVS5258 - starlink 02600 print).jpg",
  // Warehouse robots. CC BY-SA 4.0.
  automation: "Ocado warehouse bots.jpg",
  // Supercomputer. Public domain.
  computing: "Oak Ridge - Kraken (Cray XT5).JPG",
  // Terrestrial globe, circa 1725. CC BY-SA 4.0.
  globe: "German terrestrial globe, circa 1725.jpg",
} as const;

export type CrisisImageKey = keyof typeof CRISIS_IMAGE_FILES;

/** First match wins, so the specific rules sit above the broad ones. */
const RULES: ReadonlyArray<readonly [RegExp, CrisisImageKey]> = [
  [/wildfire|megafire|forest fire|fire season/, "wildfire"],
  [/chip fab fire|industrial accident|refinery|plant fire|explosion/, "industrial"],
  [/tsunami/, "tsunami"],
  [/storm surge|king tide|coastal storm/, "flood"],
  [/flood/, "flood"],
  [/earthquake|quake/, "earthquake"],
  [/hurricane|cyclone|typhoon/, "hurricane"],
  [/tornado/, "tornado"],
  [/volcan/, "volcano"],
  [/solar storm|geomagnetic/, "solar"],
  [/orbital|orbit|satellite/, "orbit"],
  [/winter storm|blizzard|ice storm/, "winter"],
  [/avalanche/, "avalanche"],
  [/landslide|mudslide/, "landslide"],
  [/dust storm/, "dust"],
  [/hail/, "hail"],
  [/\bheat/, "heat"],
  [/aquifer|water crisis|water rationing|municipal water/, "water"],
  [/drought|famine/, "drought"],
  [/blight|crop|harvest|food/, "drought"],
  [/pest|beetle|infestation/, "pest"],
  [/pandemic|epidemic|outbreak of|virus|disease/, "pandemic"],
  [/hospital|health system/, "hospital"],
  [/nuclear/, "nuclear"],
  [/bridge/, "bridge"],
  [/grid|blackout|power outage/, "blackout"],
  [/energy|power/, "power"],
  [/cyber|hack|ransom|data breach/, "cyber"],
  [/disinformation|synthetic media|ai model/, "computing"],
  [/automation|robotic|autonomous|logistics stall/, "automation"],
  [/refugee|displac/, "refugees"],
  [/bank run|banking|bank failure|lender run|run on/, "bank"],
  [/housing|property/, "housing"],
  [/shortage|panic buying|supply/, "shortage"],
  [/stock|market|bubble|tech|currency|crash|panic|financial/, "markets"],
  [/inflation|price/, "prices"],
  [/trade war|tariff|shipping|embargo/, "shipping"],
  [/strike|lockout|walkout|labor|labour|union/, "strike"],
  [/\bport\b|\bdock|longshore/, "port"],
  [/protest|riot|unrest|march|campus|backlash|reform movement/, "protest"],
  [/coup|junta/, "coup"],
  [/war|vietnam|invasion|conflict|civil defense|bombing|missile/, "war"],
  [/debt|default|pension|insurance|recession|unemployment|layoff/, "recession"],
  [/scandal|election|parliament|ceiling|government|accord|treaty|pact/, "government"],
];

const KIND_FALLBACK: Record<CrisisKind, CrisisImageKey> = {
  war: "war",
  disaster: "flood",
  economic: "markets",
  political: "government",
  opportunity: "globe",
};

export interface CrisisImageSubject {
  name: string;
  kind: CrisisKind;
  templateKey?: string | null;
}

export function crisisImageKey(subject: CrisisImageSubject): CrisisImageKey {
  const haystack = `${subject.templateKey ?? ""} ${subject.name}`.toLowerCase().replace(/_/g, " ");
  if (subject.kind === "opportunity") return "globe";
  for (const [pattern, key] of RULES) {
    if (pattern.test(haystack)) return key;
  }
  return KIND_FALLBACK[subject.kind];
}

/** Photo URL for a crisis, sized for a card thumbnail unless `width` says otherwise. */
export function crisisImageUrl(subject: CrisisImageSubject, width = 640): string {
  return fp(CRISIS_IMAGE_FILES[crisisImageKey(subject)], width);
}
