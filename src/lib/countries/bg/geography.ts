import type { CountryGeography } from "../contract";
import { bgRegionCensusData1953 } from "@/lib/seeds/bg/bgRegionCensusData1953";
import { bgRegions } from "./data/bgRegions";
import { bgRegions1953 } from "./data/bgRegions1953";
import { bgRegions1991 } from "./data/bgRegions1991";
import { bgRegions2027 } from "./data/bgRegions2027";
import {
  BG_ADJACENCY_MAP,
  BG_CONTINENT,
  BG_ISO_NUMERIC,
  BG_MAP_REGISTRY,
  BG_NPP_CAPITAL_STATE,
  BG_UN_MEMBER_SINCE,
  BG_WORLD_REGION,
} from "./geographyFacts";

/**
 * Heavy: imports all era data as values. For a single string, import
 * geographyFacts instead, which has no value imports.
 * Preset keys mirror the snapshot exactly: gaps are real, an unauthored era
 * inherits, and inventing a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  bgRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": bgRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": bgRegions1953,
  "1979-default": bgRegions,
  "1991-default": bgRegions1991,
  "2019-default": bgRegions,
  "2027-default": bgRegions2027,
};

export const BG_GEOGRAPHY: CountryGeography = {
  continent: BG_CONTINENT,

  isoNumeric: BG_ISO_NUMERIC,
  unMemberSince: BG_UN_MEMBER_SINCE,
  worldRegion: BG_WORLD_REGION,
  nppCapitalState: BG_NPP_CAPITAL_STATE,
  adjacency: BG_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: BG_MAP_REGISTRY,
};
