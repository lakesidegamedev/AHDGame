/** Import-free predicates for client map controls; reference assets stay server-side. */
export const CANADIAN_LOCAL_GEOGRAPHY_COUNTRY_ID = "CA";

export function isCanada(countryId: string): boolean {
  return countryId === CANADIAN_LOCAL_GEOGRAPHY_COUNTRY_ID;
}

export function isCanadianCommons(type: string): boolean {
  return type === "caCommons" || type === "snap_caCommons" || type === "special_caCommons";
}

export function canadianRidingNotice(type: string, notice?: string): string | undefined {
  if (type !== "special_caCommons") return notice;
  return [
    notice,
    "This regional by-election fills only contested vacancies. Riding placement is modeled; unassigned ridings are outside this contest. Campaigning changes placement, not seat totals.",
  ]
    .filter(Boolean)
    .join(" ");
}
