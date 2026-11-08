import type { CountryGeography } from "../contract";
import { trMetricPresets1953 } from "./data/trMetricPresets1953";
import { trMetricPresetsModern } from "./data/trMetricPresetsModern";
import { trRegionCensusData } from "@/lib/seeds/tr/trRegionCensusData";
import { trRegionCensusDataModern } from "./data/trRegionCensusDataModern";
import { trRegionCensusData1953 } from "@/lib/seeds/tr/trRegionCensusData1953";
import { trRegions } from "./data/trRegions";
import { trRegions1991 } from "./data/trRegions1991";
import { trRegions1953 } from "./data/trRegions1953";
import { trRegions2013 } from "./data/trRegions2013";
import { trRegionsModern } from "./data/trRegionsModern";
import { trStateMetrics } from "./data/trStateMetrics";
import {
  TR_ADJACENCY_MAP,
  TR_INCOME_ANCHORS,
  TR_CONTINENT,
  TR_ISO_NUMERIC,
  TR_MAP_REGISTRY,
  TR_NPP_CAPITAL_STATE,
  TR_UN_MEMBER_SINCE,
  TR_WORLD_REGION,
} from "./geographyFacts";

/**
 * HEAVY: every era of census/metric/region data is a VALUE import.
 * Registries that need one string import ./geographyFacts (no value imports),
 * to avoid pulling this into every client bundle that reads a continent.
 * Bundles are referenced, never inlined; `===` proves it, since generated copies
 * can pass deep equality while creating duplicate sources.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  trRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": trRegionCensusData1953,
  "1979-default": trRegionCensusData,
  "1991-default": trRegionCensusData,
  "1999-default": trRegionCensusData,
  "2007-default": trRegionCensusData,
  "2019-default": trRegionCensusDataModern,
  "2023-default": trRegionCensusDataModern,
  "2027-default": trRegionCensusDataModern,
};

const metricPresetBundles = {
  "1953-default": trMetricPresets1953,
  // Preserve the existing historical no-overlay behavior before adding the
  // generic selector's 2019 fallback. Modern roots must not leak backward.
  "1979-default": {},
  "1991-default": {},
  "1999-default": {},
  "2007-default": {},
  "2019-default": trMetricPresetsModern,
  "2023-default": trMetricPresetsModern,
  "2027-default": trMetricPresetsModern,
};

const populationAnchors = {};

const regionBundles = {
  "1991-default": trRegions1991,
  "1953-default": trRegions1953,
  "1979-default": trRegions,
  // Existing direct 1999/2007 seeding used the 2013-weighted population
  // proxy. Name it explicitly so modern source weights do not leak backward.
  "1999-default": trRegions2013,
  "2007-default": trRegions2013,
  "2019-default": trRegionsModern,
  "2023-default": trRegionsModern,
  "2027-default": trRegionsModern,
};

export const TR_GEOGRAPHY: CountryGeography = {
  continent: TR_CONTINENT,

  isoNumeric: TR_ISO_NUMERIC,
  unMemberSince: TR_UN_MEMBER_SINCE,
  worldRegion: TR_WORLD_REGION,
  nppCapitalState: TR_NPP_CAPITAL_STATE,
  adjacency: TR_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: trStateMetrics,
  mapRegistry: TR_MAP_REGISTRY,
  incomeAnchors: TR_INCOME_ANCHORS,
};
