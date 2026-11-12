import type { CountryGeography } from "../contract";
import { walRegionCensusData, walRegionCensusData1991 } from "@/lib/seeds/wal/walRegionCensusData";
import { walRegions } from "./data/walRegions";
import {
  WAL_ADJACENCY_MAP,
  WAL_CONTINENT,
  WAL_ISO_NUMERIC,
  WAL_MAP_REGISTRY,
  WAL_NPP_CAPITAL_STATE,
  WAL_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Wales is, and who lives there.
 * HEAVY: every era bundle is imported as a value. Registries that need one
 * string should import ./geographyFacts, which has no value imports.
 * Bundle maps must REFERENCE exported bundles, never inline copies; use ===
 * to verify identity.
 * Authored preset keys only: unauthored eras inherit, and adding a key would
 * turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  walRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "2019-default": walRegionCensusData,
  "1991-default": walRegionCensusData1991,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "2019-default": walRegions,
};

export const WAL_GEOGRAPHY: CountryGeography = {
  continent: WAL_CONTINENT,

  isoNumeric: WAL_ISO_NUMERIC,
  worldRegion: WAL_WORLD_REGION,
  nppCapitalState: WAL_NPP_CAPITAL_STATE,
  adjacency: WAL_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: WAL_MAP_REGISTRY,
  demographicCategoryIds: ["uk_voterGroups"],
};
