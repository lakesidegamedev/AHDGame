import type { CountryGeography } from "../contract";
import { abRegionCensusData2027 } from "./data/abRegionCensusData2027";
import { abRegions } from "./data/abRegions";
import {
  AB_ADJACENCY_MAP,
  AB_CONTINENT,
  AB_ISO_NUMERIC,
  AB_MAP_REGISTRY,
  AB_NPP_CAPITAL_STATE,
  AB_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Alberta is, and who lives there.
 *
 * The census feeds the electorate model. There are no metric or anchor
 * bundles: independence fans the live province's metrics out across these
 * regions, so an authored bundle would never be read.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  abRegions.map((region) => [region._id, region.name])
);

const regionBundles = {
  "2027-default": abRegions,
};

export const AB_GEOGRAPHY: CountryGeography = {
  continent: AB_CONTINENT,
  isoNumeric: AB_ISO_NUMERIC,
  worldRegion: AB_WORLD_REGION,
  nppCapitalState: AB_NPP_CAPITAL_STATE,
  adjacency: AB_ADJACENCY_MAP,
  regionNames,
  censusBundles: { "2027-default": abRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: {},
  regionBundles,
  rawMetrics: [],
  mapRegistry: AB_MAP_REGISTRY,
};
