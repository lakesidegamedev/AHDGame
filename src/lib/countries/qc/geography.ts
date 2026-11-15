import type { CountryGeography } from "../contract";
import { qcRegionCensusData2027 } from "./data/qcRegionCensusData2027";
import { qcRegions } from "./data/qcRegions";
import {
  QC_ADJACENCY_MAP,
  QC_CONTINENT,
  QC_ISO_NUMERIC,
  QC_MAP_REGISTRY,
  QC_NPP_CAPITAL_STATE,
  QC_WORLD_REGION,
} from "./geographyFacts";

/**
 * Where Quebec is, and who lives there.
 *
 * The census feeds the electorate model. There are no metric or anchor
 * bundles: independence fans the live province's metrics out across these
 * regions, so an authored bundle would never be read.
 */

const regionNames: Record<string, string> = Object.fromEntries(
  qcRegions.map((region) => [region._id, region.name])
);

const regionBundles = {
  "2027-default": qcRegions,
};

export const QC_GEOGRAPHY: CountryGeography = {
  continent: QC_CONTINENT,
  isoNumeric: QC_ISO_NUMERIC,
  worldRegion: QC_WORLD_REGION,
  nppCapitalState: QC_NPP_CAPITAL_STATE,
  adjacency: QC_ADJACENCY_MAP,
  regionNames,
  censusBundles: { "2027-default": qcRegionCensusData2027 },
  populationAnchors: {},
  metricPresets: {},
  regionBundles,
  rawMetrics: [],
  mapRegistry: QC_MAP_REGISTRY,
};
