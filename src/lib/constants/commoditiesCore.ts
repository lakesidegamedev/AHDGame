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
