import type { CountryGeography } from "../contract";
import { yuRegionCensusData1953 } from "@/lib/seeds/yu/yuRegionCensusData1953";
import { yuRegions } from "./data/yuRegions";
import { yuRegions1953 } from "./data/yuRegions1953";
import { yuRegions1991 } from "./data/yuRegions1991";
import {
  YU_ADJACENCY_MAP,
  YU_CONTINENT,
  YU_ISO_NUMERIC,
  YU_MAP_REGISTRY,
  YU_NPP_CAPITAL_STATE,
  YU_UN_MEMBER_SINCE,
  YU_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Yugoslavia is, and who lives there.
 * HEAVY: every era of census, metric and region data is a value import. Registries
 * that need one string import `./geographyFacts` instead. Bundles are referenced,
 * never inlined. Unauthored eras inherit; do not invent keys for them.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  yuRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": yuRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": yuRegions1953,
  "1979-default": yuRegions,
  "1991-default": yuRegions1991,
  "2019-default": yuRegions,
};

export const YU_GEOGRAPHY: CountryGeography = {
  continent: YU_CONTINENT,

  isoNumeric: YU_ISO_NUMERIC,
  unMemberSince: YU_UN_MEMBER_SINCE,
  worldRegion: YU_WORLD_REGION,
  nppCapitalState: YU_NPP_CAPITAL_STATE,
  adjacency: YU_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: YU_MAP_REGISTRY,
};
