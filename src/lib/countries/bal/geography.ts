import type { CountryGeography } from "../contract";
import { balRegionCensusData } from "@/lib/seeds/bal/balRegionCensusData";
import { balRegionCensusData1953 } from "@/lib/seeds/bal/balRegionCensusData1953";
import { balRegions } from "./data/balRegions";
import { balRegions1953 } from "./data/balRegions1953";
import {
  BAL_ADJACENCY_MAP,
  BAL_CONTINENT,
  BAL_MAP_REGISTRY,
  BAL_NPP_CAPITAL_STATE,
  BAL_WORLD_REGION,
} from "./geographyFacts";

/**
 * Heavy: imports all era data as values. For a single string, import
 * geographyFacts instead, which has no value imports.
 * Preset keys mirror the snapshot exactly: gaps are real, an unauthored era
 * inherits, and inventing a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  balRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": balRegionCensusData1953,
  "1979-default": balRegionCensusData,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": balRegions1953,
  "2019-default": balRegions,
};

export const BAL_GEOGRAPHY: CountryGeography = {
  continent: BAL_CONTINENT,

  worldRegion: BAL_WORLD_REGION,
  nppCapitalState: BAL_NPP_CAPITAL_STATE,
  adjacency: BAL_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: BAL_MAP_REGISTRY,
};
