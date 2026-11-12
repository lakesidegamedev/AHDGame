import type { CountryGeography } from "../contract";
import { roRegionCensusData1953 } from "@/lib/seeds/ro/roRegionCensusData1953";
import { roRegions } from "./data/roRegions";
import { roRegions1953 } from "./data/roRegions1953";
import { roRegions1991 } from "./data/roRegions1991";
import { roRegions2027 } from "./data/roRegions2027";
import {
  RO_ADJACENCY_MAP,
  RO_CONTINENT,
  RO_ISO_NUMERIC,
  RO_MAP_REGISTRY,
  RO_NPP_CAPITAL_STATE,
  RO_UN_MEMBER_SINCE,
  RO_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Romania is, and who lives there.
 *
 * HEAVY: imports every era of census, metric and region data by value.
 * Registries needing one string must import `./geographyFacts` instead.
 *
 * Bundles are referenced, never inlined; use `===` to verify identity.
 *
 * Preset keys come from the snapshot plus authored 2027. Romania authors
 * 1 census, 0 metric, 0 anchor and 4 region eras; gaps inherit and must
 * not gain invented keys.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  roRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": roRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": roRegions1953,
  "1979-default": roRegions,
  "1991-default": roRegions1991,
  "2019-default": roRegions,
  "2027-default": roRegions2027,
};

export const RO_GEOGRAPHY: CountryGeography = {
  continent: RO_CONTINENT,

  isoNumeric: RO_ISO_NUMERIC,
  unMemberSince: RO_UN_MEMBER_SINCE,
  worldRegion: RO_WORLD_REGION,
  nppCapitalState: RO_NPP_CAPITAL_STATE,
  adjacency: RO_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: RO_MAP_REGISTRY,
};
