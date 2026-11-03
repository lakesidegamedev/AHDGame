import type { CountryId } from "@/lib/constants/countriesCore";

/**
 * intorg id -> the country whose central bank represents it.
 *
 * Split out of `helpers.ts` so notification source links can resolve the
 * representative without pulling the authoring helpers, the euro service and
 * the full country client registry into the browser. Empty for every org whose
 * members keep their own banks; `intorgRepresentative.test.ts` pins this to the
 * registry, so authoring a new shared bank fails the test until it is listed.
 */
export const INTORG_REPRESENTATIVE_CENTRAL_BANK: Partial<Record<string, CountryId>> = {
  EU: "DE",
};

export function getRepresentativeCentralBankCountry(intorgId: string): CountryId | null {
  return INTORG_REPRESENTATIVE_CENTRAL_BANK[intorgId] ?? null;
}
