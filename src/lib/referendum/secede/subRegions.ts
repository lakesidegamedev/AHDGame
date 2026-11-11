import type { CountryId } from "@/lib/constants/countriesCore";
import type { State } from "@/lib/db/types";
import { scoRegions } from "@/lib/seeds/sco/scoRegions";
import { walRegions } from "@/lib/seeds/wal/walRegions";
import { sovereigntyRegionForSuccessor } from "../rules/sovereigntyRegions";

export type SecedingCountryId = "SCO" | "WAL";

/** Latent sub-region seed maps, keyed by seceding country. */
export const SUB_REGION_SEEDS: Record<SecedingCountryId, State[]> = {
  SCO: scoRegions,
  WAL: walRegions,
};

/**
 * Capital sub-region per seceding country: the re-home target for residents and
 * the single-region devolved-government artifacts (statePolicies/stateBills/
 * governor-office records) when the aggregate region fans out.
 */
export const CAPITAL_SUBREGION: Record<SecedingCountryId, string> = {
  SCO: "LOT", // Edinburgh & the Lothians
  WAL: "CDF", // Cardiff & South East
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
