/** The stage headline: "The 1992 Presidential Election". */
export function presidentialTitle(year: number | string | null | undefined): string {
  return year ? `The ${year} Presidential Election` : "The Presidential Election";
}
