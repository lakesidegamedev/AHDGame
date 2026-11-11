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
  /** Who asks for the referendum, as written in wire copy. */
  readonly executiveTitle: string;
  /** How copy names the national government the region would leave. */
  readonly nationalGovernmentName: string;
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
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    electionParties: { separatist: ["uk_snp"], rivals: ["uk_conservative"] },
    actuates: true,
  },
  {
    countryId: "UK",
    regionId: "WAL",
    kind: "independence",
    targetCountryId: null,
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    electionParties: { separatist: ["uk_plaid"], rivals: ["uk_conservative"] },
    actuates: true,
  },
  {
    countryId: "UK",
    regionId: "NIR",
    kind: "reunification",
    targetCountryId: "IE",
    executiveTitle: "First Minister",
    nationalGovernmentName: "Westminster",
    electionParties: { separatist: ["uk_sf"], rivals: ["uk_dup", "uk_uup"] },
    actuates: true,
  },
  {
    countryId: "CA",
    regionId: "CA_QC",
    kind: "independence",
    targetCountryId: null,
    executiveTitle: "Premier",
    nationalGovernmentName: "Ottawa",
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
