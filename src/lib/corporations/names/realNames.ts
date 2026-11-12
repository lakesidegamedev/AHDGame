/**
 * Real company names and logos for NPP corporations in modern worlds.
 * Worlds before REAL_COMPANY_NAMES_FROM_YEAR, countries without a table and
 * exhausted pools keep the invented names from rules.ts.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";
import logoManifest from "./companyLogos.json";
import { REAL_BANK_ENTRIES, REAL_COMPANY_ENTRIES } from "./realCompanies";

export const REAL_COMPANY_NAMES_FROM_YEAR = 2015;

/** "sector" draws from the industry table, "bank" from the retail bank list. */
export type RealNameKind = "sector" | "bank";

const LOGOS: Readonly<Record<string, string>> = logoManifest;

function displayName(entry: string): string {
  return entry.split("|")[0]!;
}

function normalized(name: string): string {
  return name.trim().toLowerCase();
}

export function realCompanyNamesFor(countryId: string, lane: OperatingSectorType): string[] {
  return (REAL_COMPANY_ENTRIES[countryId]?.[lane] ?? []).map(displayName);
}

export function realBankNamesFor(countryId: string): string[] {
  return (REAL_BANK_ENTRIES[countryId] ?? []).map(displayName);
}

export function allRealCompanyNames(): string[] {
  return [
    ...Object.values(REAL_COMPANY_ENTRIES).flatMap((table) => Object.values(table).flat()),
    ...Object.values(REAL_BANK_ENTRIES).flat(),
  ].map(displayName);
}

export function isRealCompanyWorld(worldYear: number | null | undefined): boolean {
  return typeof worldYear === "number" && worldYear >= REAL_COMPANY_NAMES_FROM_YEAR;
}

/**
 * Picks an unused real company. Banks fill in list order so the largest names
 * come first; industry picks start at a random entry. Null when the country
 * has no table or every name is taken.
 */
export function chooseRealCompanyName(input: {
  countryId: string;
  lane: OperatingSectorType;
  kind: RealNameKind;
  existingNames: readonly string[];
  rng: () => number;
}): string | null {
  const pool =
    input.kind === "bank"
      ? realBankNamesFor(input.countryId)
      : realCompanyNamesFor(input.countryId, input.lane);
  if (pool.length === 0) return null;
  const occupied = new Set(input.existingNames.map(normalized));
  const sample = input.kind === "bank" ? 0 : input.rng();
  const start = Math.floor(
    (Number.isFinite(sample) ? Math.max(0, Math.min(0.999999, sample)) : 0) * pool.length
  );
  for (let offset = 0; offset < pool.length; offset++) {
    const name = pool[(start + offset) % pool.length]!;
    if (!occupied.has(normalized(name))) return name;
  }
  return null;
}

/** Site-relative logo path for a real company, when a logo file ships for it. */
export function realCompanyLogoUrl(name: string): string | undefined {
  return LOGOS[name];
}
