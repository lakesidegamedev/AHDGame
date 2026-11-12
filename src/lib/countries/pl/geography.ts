import type { CountryGeography } from "../contract";
import { plRegionCensusData1953 } from "./data/plRegionCensusData1953";
import { plRegions } from "./data/plRegions";
import { plRegions1953 } from "./data/plRegions1953";
import { plRegions1991 } from "./data/plRegions1991";
import { plRegions2027 } from "./data/plRegions2027";
import {
  PL_ADJACENCY_MAP,
  PL_CONTINENT,
  PL_ISO_NUMERIC,
  PL_MAP_REGISTRY,
  PL_NPP_CAPITAL_STATE,
  PL_UN_MEMBER_SINCE,
  PL_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Poland is, and who lives there.
 *
 * HEAVY: imports every era of census, metric and region data by value.
 * Registries needing one string must import `./geographyFacts` instead.
 *
 * Bundles are referenced, never inlined; use `===` to verify identity.
 *
 * Preset keys come from the snapshot plus authored 2027. Poland authors
 * 1 census, 0 metric, 0 anchor and 4 region eras; gaps inherit and must
 * not gain invented keys.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  plRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": plRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": plRegions1953,
  "1979-default": plRegions,
  "1991-default": plRegions1991,
  "2019-default": plRegions,
  "2027-default": plRegions2027,
};

export const PL_GEOGRAPHY: CountryGeography = {
  continent: PL_CONTINENT,

  isoNumeric: PL_ISO_NUMERIC,
  unMemberSince: PL_UN_MEMBER_SINCE,
  worldRegion: PL_WORLD_REGION,
  nppCapitalState: PL_NPP_CAPITAL_STATE,
  adjacency: PL_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: PL_MAP_REGISTRY,
};
