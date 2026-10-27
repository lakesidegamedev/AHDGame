/**
 * Client-safe core of the commodity catalogue: the type unions and their display
 * labels.
 *
 * commodities.ts re-exports every name here, so server code keeps importing the
 * full catalogue unchanged. Client components that only render a commodity or
 * resource name import this module instead, which keeps the price, demand and
 * supply tables out of the browser bundle.
 */

export const COMMODITY_TYPES = [
  "steel",
  "electronics",
  "energy",
  "chemicals",
  "pharmaceuticals",
  "fertilizers",
  "food",
  "building_materials",
  "construction_services",
  "healthcare_services",
  "real_estate_services",
  "software",
  "financial_services",
  "advertising",
  "vehicles",
  "retail",
  "freight",
  "consulting_services",
  "iron",
  "coal",
  "oil",
  "rare_earth",
  "timber",
  "natural_gas",
  "ordnance",
  "plastics",
  "network_services",
] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number];

export const EXTRACTABLE_RESOURCES = [
  "oil",
  "coal",
  "iron",
  "natural_gas",
  "timber",
  "rare_earth",
] as const;

export type ExtractableResource = (typeof EXTRACTABLE_RESOURCES)[number];

export const COMMODITY_LABELS: Record<CommodityType, string> = {
  steel: "Steel & Metals",
  electronics: "Electronics & Semiconductors",
  energy: "Electricity",
  chemicals: "Industrial Chemicals",
  pharmaceuticals: "Pharmaceuticals",
  fertilizers: "Fertilizers",
  food: "Food Products",
  building_materials: "Building Materials",
  construction_services: "Construction Services",
  healthcare_services: "Healthcare Services",
  real_estate_services: "Real Estate Services",
  software: "Software & IT Services",
  financial_services: "Financial Services",
  advertising: "Advertising & Media",
  vehicles: "Vehicles & Machinery",
  retail: "Consumer Goods",
  freight: "Freight & Transportation",
  consulting_services: "Consulting Services",
  iron: "Iron Ore",
  coal: "Coal",
  oil: "Crude Oil",
  rare_earth: "Rare Earth Minerals",
  timber: "Timber & Lumber",
  natural_gas: "Natural Gas",
  ordnance: "Ordnance & Weapons Systems",
  plastics: "Plastics & Polymers",
  network_services: "Network Services",
};

/** Hero image slug for each commodity (served by /api/images/hero/[slug]) */
export const COMMODITY_HERO_SLUGS: Record<CommodityType, string> = {
  steel: "commodity-steel",
  electronics: "commodity-electronics",
  energy: "commodity-energy",
  chemicals: "commodity-chemicals",
  pharmaceuticals: "commodity-pharmaceuticals",
  fertilizers: "commodity-fertilizers",
  food: "commodity-food",
  building_materials: "commodity-building-materials",
  construction_services: "commodity-construction-services",
  healthcare_services: "commodity-healthcare-services",
  real_estate_services: "commodity-real-estate-services",
  software: "commodity-software",
  financial_services: "commodity-financial-services",
  advertising: "commodity-advertising",
  vehicles: "commodity-vehicles",
  retail: "commodity-retail",
  freight: "commodity-freight",
  consulting_services: "commodity-consulting-services",
  iron: "commodity-iron",
  coal: "commodity-coal",
  oil: "commodity-oil",
  rare_earth: "commodity-rare-earth",
  timber: "commodity-timber",
  natural_gas: "commodity-natural-gas",
  ordnance: "commodity-ordnance",
  plastics: "commodity-plastics",
  network_services: "commodity-network-services",
};

/** Alt text for commodity hero images */
export const COMMODITY_HERO_ALTS: Record<CommodityType, string> = {
  steel: "Showa Steel Works industrial facility",
  electronics: "TSMC semiconductor fabrication plant",
  energy: "High-voltage power lines at sunset",
  chemicals: "BASF chemical plant in Ludwigshafen",
  pharmaceuticals: "Pharmaceutical manufacturing line with packaged medicines",
  fertilizers: "Agricultural fertilizer spreader in a crop field",
  food: "Combine harvester gathering wheat",
  building_materials: "Construction site with building materials",
  construction_services: "Construction crews working on a high-rise project",
  healthcare_services: "Modern hospital ward providing patient care",
  real_estate_services: "Residential and commercial real estate skyline",
  software: "Wikimedia Foundation server room",
  financial_services: "New York Stock Exchange building on Wall Street",
  advertising: "Broadway and Times Square lit up at night",
  vehicles: "Hyundai car assembly line",
  retail: "Macy's department store at Herald Square",
  freight: "Sovereign Maersk container ship at sea",
  consulting_services: "Booz Allen Hamilton office in Washington D.C.",
  iron: "Iron ore factory in Karnataka, India",
  coal: "North Antelope Rochelle coal mine, Wyoming",
  oil: "Petrobras P-51 offshore oil platform, Brazil",
  rare_earth:
    "Rare earth oxide samples: praseodymium, cerium, lanthanum, neodymium, samarium, gadolinium",
  timber: "Timber logging operation in the Pacific Northwest",
  natural_gas: "Natural gas processing plant and pipeline infrastructure",
  ordnance: "Ordnance assembly line at a weapons manufacturing facility",
  plastics: "Industrial polymer extrusion and plastics manufacturing plant",
  network_services: "Fiber optic data center network infrastructure",
};

/** Short icon key for each commodity. */
export const COMMODITY_ICONS: Record<CommodityType, string> = {
  steel: "Fe",
  electronics: "Si",
  energy: "kW",
  chemicals: "Ch",
  pharmaceuticals: "Rx",
  fertilizers: "NPK",
  food: "Ag",
  building_materials: "BM",
  construction_services: "Cn",
  healthcare_services: "HC",
  real_estate_services: "RE",
  software: "SW",
  financial_services: "Fi",
  advertising: "Ad",
  vehicles: "Ve",
  retail: "CG",
  freight: "Fr",
  consulting_services: "Cs",
  iron: "Fe",
  coal: "Co",
  oil: "Oi",
  rare_earth: "RE",
  timber: "Ti",
  natural_gas: "NG",
  ordnance: "Ord",
  plastics: "Pl",
  network_services: "NS",
};
