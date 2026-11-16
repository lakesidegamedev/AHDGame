import type { CountryGeography } from "../contract";
import { rtxRegionCensusData2027 } from "./data/rtxRegionCensusData2027";
import { rtxRegions } from "./data/rtxRegions";
import {
  RTX_ADJACENCY_MAP,
  RTX_CONTINENT,
  RTX_ISO_NUMERIC,
  RTX_MAP_REGISTRY,
  RTX_NPP_CAPITAL_STATE,
  RTX_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Texas is, and who lives there.
 *
 * The census feeds the electorate model. There are no metric or anchor
 * bundles: independence fans the live province's metrics out across these
 * regions, so an authored bundle would never be read.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  rtxRegions.map((region) => [region._id, region.name])
);

const regionBundles = {
  "2027-default": rtxRegions,
};

export const RTX_GEOGRAPHY: CountryGeography = {
  continent: RTX_CONTINENT,
  isoNumeric: RTX_ISO_NUMERIC,
  worldRegion: RTX_WORLD_REGION,
  nppCapitalState: RTX_NPP_CAPITAL_STATE,
  adjacency: RTX_ADJACENCY_MAP,
  regionNames,
  censusBundles: { "2027-default": rtxRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: {},
  regionBundles,
  rawMetrics: [],
  mapRegistry: RTX_MAP_REGISTRY,
};
