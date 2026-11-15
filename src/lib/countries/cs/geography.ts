import type { CountryGeography } from "../contract";
import { csRegionCensusData1953 } from "@/lib/seeds/cs/csRegionCensusData1953";
import { csRegions } from "./data/csRegions";
import { csRegions1953 } from "./data/csRegions1953";
import { csRegions1991 } from "./data/csRegions1991";
import {
  CS_ADJACENCY_MAP,
  CS_CONTINENT,
  CS_ISO_NUMERIC,
  CS_MAP_REGISTRY,
  CS_NPP_CAPITAL_STATE,
  CS_UN_MEMBER_SINCE,
  CS_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Czechoslovakia is, and who lives there.
 *
 * HEAVY: every census, metric and region era is imported as a VALUE. Registries
 * needing one string must import `./geographyFacts` (zero value imports) or they
 * pull this whole module into client bundles.
 *
 * Bundles are REFERENCED, never inlined; `===` proves it. Copies here once let a
 * country carry two sources for every region while deep equality passed.
 *
 * Only preset keys from the snapshot are authored; unauthored eras inherit. Do
 * not invent keys for gaps or a fallback becomes an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  csRegions.map((region) => [region._id, region.name])
);

const censusBundles = {
  "1953-default": csRegionCensusData1953,
};

const metricPresetBundles = {};

const populationAnchors = {};

const regionBundles = {
  "1953-default": csRegions1953,
  "1979-default": csRegions,
  "1991-default": csRegions1991,
  "2019-default": csRegions,
};

export const CS_GEOGRAPHY: CountryGeography = {
  continent: CS_CONTINENT,

  isoNumeric: CS_ISO_NUMERIC,
  unMemberSince: CS_UN_MEMBER_SINCE,
  worldRegion: CS_WORLD_REGION,
  nppCapitalState: CS_NPP_CAPITAL_STATE,
  adjacency: CS_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: [],
  mapRegistry: CS_MAP_REGISTRY,
};
