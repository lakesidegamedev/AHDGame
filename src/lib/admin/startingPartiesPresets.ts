/** Presets whose player countries may open with no parties. Client-safe. */
const NO_STARTING_PARTIES_PRESETS: ReadonlySet<string> = new Set(["1991-default", "2027-default"]);

export function supportsNoStartingParties(preset: string | null | undefined): boolean {
  return typeof preset === "string" && NO_STARTING_PARTIES_PRESETS.has(preset);
}
