import type { CountryGeography } from "../contract";
import { blrRegionCensusData } from "@/lib/seeds/blr/blrRegionCensusData";
import { blrRegionCensusData1953 } from "@/lib/seeds/blr/blrRegionCensusData1953";
import { blrRegions } from "./data/blrRegions";
import { blrRegions1953 } from "./data/blrRegions1953";
import {
  BLR_ADJACENCY_MAP,
  BLR_CONTINENT,
  BLR_ISO_NUMERIC,
  BLR_MAP_REGISTRY,
  BLR_NPP_CAPITAL_STATE,
  BLR_UN_MEMBER_SINCE,
  BLR_WORLD_REGION,
} from "./geographyFacts";

/**
 * Heavy: imports all era data as values. For a single string, import
 * geographyFacts instead, which has no value imports.
 * Preset keys mirror the snapshot exactly: gaps are real, an unauthored era
 * inherits, and inventing a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  blrRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": blrRegionCensusData1953,
  "1979-default": blrRegionCensusData,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": blrRegions1953,
  "2019-default": blrRegions,
};

export const BLR_GEOGRAPHY: CountryGeography = {
  continent: BLR_CONTINENT,

  isoNumeric: BLR_ISO_NUMERIC,
  unMemberSince: BLR_UN_MEMBER_SINCE,
  worldRegion: BLR_WORLD_REGION,
  nppCapitalState: BLR_NPP_CAPITAL_STATE,
  adjacency: BLR_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: BLR_MAP_REGISTRY,
};
