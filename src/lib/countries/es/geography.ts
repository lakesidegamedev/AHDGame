import type { CountryGeography } from "../contract";
import { modernRegionalPopulation2027 } from "@/lib/seeds/reference/modernRegionalPopulation2027";
import { esMetricPresets1953 } from "./data/esMetricPresets1953";
import { esRegionCensusData } from "@/lib/seeds/es/esRegionCensusData";
import { esRegionCensusData1953 } from "@/lib/seeds/es/esRegionCensusData1953";
import { esRegions } from "./data/esRegions";
import { esRegions1991 } from "./data/esRegions1991";
import { esRegions1953 } from "./data/esRegions1953";
import { esStateMetrics } from "./data/esStateMetrics";
import {
  ES_ADJACENCY_MAP,
  ES_INCOME_ANCHORS,
  ES_CONTINENT,
  ES_ISO_NUMERIC,
  ES_MAP_REGISTRY,
  ES_NPP_CAPITAL_STATE,
  ES_UN_MEMBER_SINCE,
  ES_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Spain is, and who lives there.
 *
 * HEAVY: imports every census, metric and region era as a VALUE. Use
 * `./geographyFacts` (no value imports) for single strings; repointing a
 * registry here pulls 108 KB into every client bundle that reads it.
 *
 * Bundles must be REFERENCED, never inlined; `===` proves it. Copies pass
 * deep equality and create duplicate sources per region.
 *
 * Preset keys come from the snapshot. Spain authors 2 census eras, 1 metric
 * era, 0 anchor eras, 4 region eras. Gaps are real: unauthored eras inherit,
 * and adding a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  esRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": esRegionCensusData1953,
  "1979-default": esRegionCensusData,
};

const metricPresetBundles = {
  "1953-default": esMetricPresets1953,
};

const populationAnchors = {};

const regionBundles = {
  "1991-default": esRegions1991,
  "1953-default": esRegions1953,
  "1979-default": esRegions,
  "2019-default": esRegions,
  "2027-default": modernRegionalPopulation2027("ES", esRegions),
};

export const ES_GEOGRAPHY: CountryGeography = {
  continent: ES_CONTINENT,

  isoNumeric: ES_ISO_NUMERIC,
  unMemberSince: ES_UN_MEMBER_SINCE,
  worldRegion: ES_WORLD_REGION,
  nppCapitalState: ES_NPP_CAPITAL_STATE,
  adjacency: ES_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: esStateMetrics,
  mapRegistry: ES_MAP_REGISTRY,
  incomeAnchors: ES_INCOME_ANCHORS,
};
