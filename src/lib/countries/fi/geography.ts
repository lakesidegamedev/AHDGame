import type { CountryGeography } from "../contract";
import { modernRegionalPopulation2027 } from "@/lib/seeds/reference/modernRegionalPopulation2027";
import { fiMetricPresets1953 } from "./data/fiMetricPresets1953";
import { fiMetricPresets1991 } from "./data/fiMetricPresets1991";
import { fiRegions } from "./data/fiRegions";
import { fiRegions1953 } from "./data/fiRegions1953";
import { fiStateMetrics } from "./data/fiStateMetrics";
import {
  FI_ADJACENCY_MAP,
  FI_INCOME_ANCHORS,
  FI_CONTINENT,
  FI_ISO_NUMERIC,
  FI_MAP_REGISTRY,
  FI_NPP_CAPITAL_STATE,
  FI_UN_MEMBER_SINCE,
  FI_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Finland is, and who lives there.
 *
 * HEAVY: imports every census, metric and region era as a VALUE. Use
 * `./geographyFacts` (no value imports) for single strings; repointing a
 * registry here pulls 108 KB into every client bundle that reads it.
 *
 * Bundles must be REFERENCED, never inlined; `===` proves it. Copies pass
 * deep equality and create duplicate sources per region.
 *
 * Preset keys come from the snapshot. Finland authors 0 census eras, 1 metric
 * era, 0 anchor eras, 3 region eras. Gaps are real: unauthored eras inherit,
 * and adding a key would turn a fallback into an authored value.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  fiRegions.map((region) => [region._id, region.name])
);

const censusBundles = {};

const metricPresetBundles = {
  "1953-default": fiMetricPresets1953,
  "1991-default": fiMetricPresets1991,
};

const populationAnchors = {};

const regionBundles = {
  "1953-default": fiRegions1953,
  "1979-default": fiRegions,
  "2019-default": fiRegions,
  "2027-default": modernRegionalPopulation2027("FI", fiRegions),
};

export const FI_GEOGRAPHY: CountryGeography = {
  continent: FI_CONTINENT,

  isoNumeric: FI_ISO_NUMERIC,
  unMemberSince: FI_UN_MEMBER_SINCE,
  worldRegion: FI_WORLD_REGION,
  nppCapitalState: FI_NPP_CAPITAL_STATE,
  adjacency: FI_ADJACENCY_MAP,
  regionNames,
  censusBundles,
  populationAnchors,
  metricPresets: metricPresetBundles,
  regionBundles,
  rawMetrics: fiStateMetrics,
  mapRegistry: FI_MAP_REGISTRY,
  incomeAnchors: FI_INCOME_ANCHORS,
};
