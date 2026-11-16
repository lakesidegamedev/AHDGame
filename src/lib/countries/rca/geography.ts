import type { CountryGeography } from "../contract";
import { rcaRegionCensusData2027 } from "./data/rcaRegionCensusData2027";
import { rcaRegions } from "./data/rcaRegions";
import {
  RCA_ADJACENCY_MAP,
  RCA_CONTINENT,
  RCA_ISO_NUMERIC,
  RCA_MAP_REGISTRY,
  RCA_NPP_CAPITAL_STATE,
  RCA_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where California is, and who lives there.
 *
 * The census feeds the electorate model. There are no metric or anchor
 * bundles: independence fans the live province's metrics out across these
 * regions, so an authored bundle would never be read.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  rcaRegions.map((region) => [region._id, region.name])
);

const regionBundles = {
  "2027-default": rcaRegions,
};

export const RCA_GEOGRAPHY: CountryGeography = {
  continent: RCA_CONTINENT,
  isoNumeric: RCA_ISO_NUMERIC,
  worldRegion: RCA_WORLD_REGION,
  nppCapitalState: RCA_NPP_CAPITAL_STATE,
  adjacency: RCA_ADJACENCY_MAP,
  regionNames,
  censusBundles: { "2027-default": rcaRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: {},
  regionBundles,
  rawMetrics: [],
  mapRegistry: RCA_MAP_REGISTRY,
};
