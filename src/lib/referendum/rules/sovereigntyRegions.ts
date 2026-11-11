/**
 * Regions that carry a separation mood and may hold an independence or
 * reunification referendum. Request, decision, drift and office surfaces ask
 * this registry instead of naming a country, so a new region is one entry.
 */
import type { CountryId } from "@/lib/constants/countriesCore";

export type SovereigntyReferendumKind = "independence" | "reunification";

export interface SovereigntyRegion {
  readonly countryId: CountryId;
  readonly regionId: string;
  readonly kind: SovereigntyReferendumKind;
  /** The country a reunifying region joins; null for independence. */
  readonly targetCountryId: CountryId | null;
  /** The latent country an independent region becomes; null until one is built. */
  readonly successorCountryId: CountryId | null;
  /** Who asks for the referendum, as written in wire copy. */
  readonly executiveTitle: string;
  /** How copy names the national government the region would leave. */
  readonly nationalGovernmentName: string;
  /** The parent country as written mid-sentence ("the United Kingdom"). */
  readonly parentName: string;
  /** Who sponsors the parent parliament's consent bill. */
  readonly consentSponsor: string;
  /**
   * Party slugs the region's mood moves votes between at elections: toward
   * the separatist parties and away from their main unionist rivals.
   */
  readonly electionParties: {
    readonly separatist: readonly string[];
    readonly rivals: readonly string[];
  };
  /**
   * Whether a passed referendum can be carried out. A region whose successor
   * country is not built yet keeps its mood but cannot open a referendum, so
   * nothing can pass into a country that does not exist.
   */
  readonly actuates: boolean;
}

export const SOVEREIGNTY_REGIONS: readonly SovereigntyRegion[] = [
  {
    countryId: "UK",
    regionId: "SCO",
    kind: "independence",
    targetCountryId: null,
    successorCountryId: "SCO",
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    parentName: "the United Kingdom",
    consentSponsor: "His Majesty's Government",
    electionParties: { separatist: ["uk_snp"], rivals: ["uk_conservative"] },
    actuates: true,
  },
  {
    countryId: "UK",
    regionId: "WAL",
    kind: "independence",
    targetCountryId: null,
    successorCountryId: "WAL",
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    parentName: "the United Kingdom",
    consentSponsor: "His Majesty's Government",
    electionParties: { separatist: ["uk_plaid"], rivals: ["uk_conservative"] },
    actuates: true,
  },
  {
    countryId: "UK",
    regionId: "NIR",
    kind: "reunification",
    targetCountryId: "IE",
    successorCountryId: null,
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    parentName: "the United Kingdom",
    consentSponsor: "His Majesty's Government",
    electionParties: { separatist: ["uk_sf"], rivals: ["uk_dup", "uk_uup"] },
    actuates: true,
  },
  {
    countryId: "CA",
    regionId: "CA_QC",
    kind: "independence",
    targetCountryId: null,
    successorCountryId: "QC",
    executiveTitle: "Premier",
    nationalGovernmentName: "Ottawa",
    parentName: "Canada",
    consentSponsor: "Government of Canada",
    electionParties: {
      separatist: ["ca_laurentian"],
      rivals: ["ca_federal_unity", "ca_national_prosperity"],
    },
    actuates: false,
  },
];

const BY_REGION = new Map(SOVEREIGNTY_REGIONS.map((entry) => [entry.regionId, entry]));

/** The registry entry for a region, matched case-insensitively. */
export function sovereigntyRegion(regionId: string): SovereigntyRegion | null {
  return BY_REGION.get(regionId.toUpperCase()) ?? null;
}

/** The entry only when the region belongs to the given country. */
export function sovereigntyRegionIn(countryId: string, regionId: string): SovereigntyRegion | null {
  const entry = sovereigntyRegion(regionId);
  return entry?.countryId === countryId ? entry : null;
}

export function isSovereigntyRegion(regionId: string): boolean {
  return BY_REGION.has(regionId.toUpperCase());
}

/** Region ids for one country, in registry order. */
export function sovereigntyRegionIds(countryId: string): string[] {
  return SOVEREIGNTY_REGIONS.filter((entry) => entry.countryId === countryId).map(
    (entry) => entry.regionId
  );
}

/** Countries with at least one sovereignty region, in registry order. */
export function sovereigntyCountryIds(): CountryId[] {
  return [...new Set(SOVEREIGNTY_REGIONS.map((entry) => entry.countryId))];
}

/** True when the country hosts the referendum process at all. */
export function hostsSovereigntyReferendums(countryId: string | null | undefined): boolean {
  return SOVEREIGNTY_REGIONS.some((entry) => entry.countryId === countryId);
}

/** Copy for a region's independence: its successor name and its parent's. */
export function independenceCopy(
  regionId: string,
  successorName: (countryId: string) => string | undefined
): { region: string; parent: string; national: string; sponsor: string } {
  const entry = sovereigntyRegion(regionId);
  const successor = entry?.successorCountryId ?? regionId;
  return {
    region: successorName(successor) ?? regionId,
    parent: entry?.parentName ?? "the United Kingdom",
    national: entry?.nationalGovernmentName ?? "Westminster",
    sponsor: entry?.consentSponsor ?? "His Majesty's Government",
  };
}

/** Names for the two governments in a region's devolution copy. */
export function getSovereigntyGovernmentNames(stateId: string): {
  regional: string;
  national: string;
} {
  const region = sovereigntyRegion(stateId);
  return {
    regional: region?.executiveTitle ?? "First Minister",
    national: region?.nationalGovernmentName ?? "Westminster",
  };
}

/** The registry entry whose independence produces the given successor country. */
export function sovereigntyRegionForSuccessor(successorId: string): SovereigntyRegion | null {
  return SOVEREIGNTY_REGIONS.find((entry) => entry.successorCountryId === successorId) ?? null;
}
