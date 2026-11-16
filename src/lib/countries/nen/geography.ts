import type { CountryGeography } from "../contract";
import { nenRegionCensusData2027 } from "./data/nenRegionCensusData2027";
import { nenRegions } from "./data/nenRegions";
import {
  NEN_ADJACENCY_MAP,
  NEN_CONTINENT,
  NEN_ISO_NUMERIC,
  NEN_MAP_REGISTRY,
  NEN_NPP_CAPITAL_STATE,
  NEN_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where New England is, and who lives there.
 *
 * The census feeds the electorate model. There are no metric or anchor
 * bundles: independence fans the live province's metrics out across these
 * regions, so an authored bundle would never be read.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  nenRegions.map((region) => [region._id, region.name])
);

const regionBundles = {
  "2027-default": nenRegions,
};

export const NEN_GEOGRAPHY: CountryGeography = {
  continent: NEN_CONTINENT,
  isoNumeric: NEN_ISO_NUMERIC,
  worldRegion: NEN_WORLD_REGION,
  nppCapitalState: NEN_NPP_CAPITAL_STATE,
  adjacency: NEN_ADJACENCY_MAP,
  regionNames,
  censusBundles: { "2027-default": nenRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: {},
  regionBundles,
  rawMetrics: [],
  mapRegistry: NEN_MAP_REGISTRY,
};
