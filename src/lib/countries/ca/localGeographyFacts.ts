/** Import-free predicates for client map controls; reference assets stay server-side. */
export const CANADIAN_LOCAL_GEOGRAPHY_COUNTRY_ID = "CA";

export function isCanada(countryId: string): boolean {
  return countryId === CANADIAN_LOCAL_GEOGRAPHY_COUNTRY_ID;
}

export function isCanadianCommons(type: string): boolean {
  return type === "caCommons" || type === "snap_caCommons";
}
