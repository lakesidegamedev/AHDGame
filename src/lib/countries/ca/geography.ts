import type { CountryGeography } from "../contract";
import { caMetricPresets2027 } from "./data/caMetricPresets2027";
import { caRegionCensusData2027 } from "./data/caRegionCensusData2027";
import { caRegions2027 } from "./data/caRegions2027";
import { caStateMetrics } from "./data/caStateMetrics";
import {
  CA_ADJACENCY_MAP,
  CA_CONSCRIPTION,
  CA_CONTINENT,
  CA_CORE5_NORMALS,
  CA_INCOME_ANCHORS,
  CA_ISO_NUMERIC,
  CA_MAP_REGISTRY,
  CA_NPP_CAPITAL_STATE,
  CA_REGION_NAMES,
  CA_UN_MEMBER_SINCE,
  CA_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Canada is, and who lives there.
 *
 * HEAVY: region and metric data are imported as values. Registries needing a
 * single string should import `./geographyFacts` instead.
 *
 * Canada exists only in the 2027 world, so the bundles carry that preset alone.
 */
export const CA_GEOGRAPHY: CountryGeography = {
  continent: CA_CONTINENT,
  isoNumeric: CA_ISO_NUMERIC,
  unMemberSince: CA_UN_MEMBER_SINCE,
  worldRegion: CA_WORLD_REGION,
  nppCapitalState: CA_NPP_CAPITAL_STATE,
  conscription: CA_CONSCRIPTION,
  core5Normals: CA_CORE5_NORMALS,
  adjacency: CA_ADJACENCY_MAP,
  regionNames: CA_REGION_NAMES,
  censusBundles: { "2027-default": caRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: { "2027-default": caMetricPresets2027 },
  regionBundles: { "2027-default": caRegions2027 },
  rawMetrics: caStateMetrics,
  mapRegistry: CA_MAP_REGISTRY,
  incomeAnchors: CA_INCOME_ANCHORS,
};
