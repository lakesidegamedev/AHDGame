/** Select the pinned 120th Congress rendering geometry for the modeled 2027 world. */
export function usCongressionalGeometryDirectory(preset: string | null | undefined): string {
  return preset === "2027-default" ? "congressional-districts/2027" : "congressional-districts";
}
