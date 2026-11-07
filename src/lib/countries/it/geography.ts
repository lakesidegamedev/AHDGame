import type { CountryGeography } from "../contract";
import { modernRegionalPopulation2027 } from "@/lib/seeds/reference/modernRegionalPopulation2027";
import { itMetricPresets1953 } from "./data/itMetricPresets1953";
import { itRegionCensusData } from "./data/itRegionCensusData";
import { itRegionCensusData1953 } from "./data/itRegionCensusData1953";
import { itRegions } from "./data/itRegions";
import { itRegions1953 } from "./data/itRegions1953";
import { itStateMetrics } from "./data/itStateMetrics";
import {
  IT_ADJACENCY_MAP,
  IT_INCOME_ANCHORS,
  IT_CONTINENT,
  IT_ISO_NUMERIC,
  IT_MAP_REGISTRY,
  IT_NPP_CAPITAL_STATE,
  IT_UN_MEMBER_SINCE,
  IT_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Italy is, and who lives there.
 *
 * HEAVY: every era of census, metric and region data is imported as a value.
 * Registries needing a single string should import `./geographyFacts` instead,
 * which has no value imports.
 *
 * Bundles are referenced, never inlined; `===` proves identity. Generating
 * copies from the snapshot once produced two sources per region.
 *
 * Preset keys come from the snapshot. Unauthored eras inherit; do not invent
 * keys for them.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  itRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": itRegionCensusData1953,
  "1979-default": itRegionCensusData,
};

const metricPresetBundles = {
  "1953-default": itMetricPresets1953,
};

const populationAnchors = {};

const regionBundles = {
  "1953-default": itRegions1953,
  "1979-default": itRegions,
  "2019-default": itRegions,
  "2027-default": modernRegionalPopulation2027("IT", itRegions),
};

export const IT_GEOGRAPHY: CountryGeography = {
  continent: IT_CONTINENT,

  isoNumeric: IT_ISO_NUMERIC,
  unMemberSince: IT_UN_MEMBER_SINCE,
  worldRegion: IT_WORLD_REGION,
  nppCapitalState: IT_NPP_CAPITAL_STATE,
  adjacency: IT_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: itStateMetrics,
  mapRegistry: IT_MAP_REGISTRY,
  incomeAnchors: IT_INCOME_ANCHORS,
};
