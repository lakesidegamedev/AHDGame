import type { CountryId } from "@/lib/constants/countriesCore";
import type { State } from "@/lib/db/types";
import { scoRegions } from "@/lib/seeds/sco/scoRegions";
import { walRegions } from "@/lib/seeds/wal/walRegions";
import { QC_CAPITAL_REGION, qcRegions } from "@/lib/countries/qc/data/qcRegions";
import { sovereigntyRegionForSuccessor } from "../rules/sovereigntyRegions";
import { isResetV2Country, type ResetV2Country } from "@/lib/resetVersions/rules";

export type SecedingCountryId = "SCO" | "WAL" | "QC";

/** Latent sub-region seed maps, keyed by seceding country. */
export const SUB_REGION_SEEDS: Record<SecedingCountryId, State[]> = {
  SCO: scoRegions,
  WAL: walRegions,
  QC: qcRegions,
};

/**
 * Capital sub-region per seceding country: the re-home target for residents and
 * the single-region devolved-government artifacts (statePolicies/stateBills/
 * governor-office records) when the aggregate region fans out.
 */
export const CAPITAL_SUBREGION: Record<SecedingCountryId, string> = {
  SCO: "LOT", // Edinburgh & the Lothians
  WAL: "CDF", // Cardiff & South East
  QC: QC_CAPITAL_REGION,
};

/** Where a successor country comes from: the parent country and the region it leaves as. */
export interface SecessionSource {
  fromCountryId: CountryId;
  regionId: string;
}

/**
 * The parent country and live region id for a successor. The region id and the
 * successor id differ when the parent names its regions by its own prefix.
 */
export function secessionSource(successorId: SecedingCountryId): SecessionSource {
  const entry = sovereigntyRegionForSuccessor(successorId);
  if (!entry || entry.kind !== "independence") {
    throw new Error(`${successorId} has no independence entry in the sovereignty registry`);
  }
  return { fromCountryId: entry.countryId, regionId: entry.regionId };
}

export function isSecedingCountryId(id: string | null | undefined): id is SecedingCountryId {
  return id != null && Object.hasOwn(SUB_REGION_SEEDS, id);
}

/** Successors whose reviewed v2 boards exist; the rest never hold v2 state. */
export type ResetV2Successor = Extract<SecedingCountryId, ResetV2Country>;

export function isResetV2Successor(id: SecedingCountryId): id is ResetV2Successor {
  return isResetV2Country(id);
}
