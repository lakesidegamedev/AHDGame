import type { CountryGeography } from "../contract";
import { huRegionCensusData1953 } from "@/lib/seeds/hu/huRegionCensusData1953";
import { huRegions } from "./data/huRegions";
import { huRegions1953 } from "./data/huRegions1953";
import { huRegions1991 } from "./data/huRegions1991";
import { huRegions2027 } from "./data/huRegions2027";
import {
  HU_ADJACENCY_MAP,
  HU_CONTINENT,
  HU_ISO_NUMERIC,
  HU_MAP_REGISTRY,
  HU_NPP_CAPITAL_STATE,
  HU_UN_MEMBER_SINCE,
  HU_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Hungary is, and who lives there.
 *
 * HEAVY: imports every census, metric and region era as a VALUE. Use
 * `./geographyFacts` (no value imports) for single strings; repointing a
 * registry here pulls 108 KB into every client bundle that reads it.
 *
 * Bundles must be REFERENCED, never inlined; `===` proves it. Copies pass
 * deep equality and create duplicate sources per region.
 *
 * Preset keys come from the snapshot. Hungary authors 1 census era, 0 metric
 * eras, 0 anchor eras, 3 region eras. Gaps are real: unauthored eras inherit,
 * and adding a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  huRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": huRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": huRegions1953,
  "1979-default": huRegions,
  "1991-default": huRegions1991,
  "2019-default": huRegions,
  "2027-default": huRegions2027,
};

export const HU_GEOGRAPHY: CountryGeography = {
  continent: HU_CONTINENT,

  isoNumeric: HU_ISO_NUMERIC,
  unMemberSince: HU_UN_MEMBER_SINCE,
  worldRegion: HU_WORLD_REGION,
  nppCapitalState: HU_NPP_CAPITAL_STATE,
  adjacency: HU_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: HU_MAP_REGISTRY,
};
