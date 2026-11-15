import { isExcludedPreset, type PresetExclusions } from "@/lib/seeds/presetExclusions";

/** Presets whose player countries may NOT open with no parties. Client-safe. */
export const NO_STARTING_PARTIES_EXCLUSIONS: PresetExclusions = {
  "1953-default": "no partyless founding opening is authored for this era",
  "1979-default": "no partyless founding opening is authored for this era",
  "1999-default": "no partyless founding opening is authored for this era",
  "2007-default": "no partyless founding opening is authored for this era",
  "2019-default": "no partyless founding opening is authored for this era",
  "2023-default": "no partyless founding opening is authored for this era",
  empty: "variant of the 2019 world, which has no partyless opening",
  "2019-no-parties": "already seeds its own party setup",
};

export function supportsNoStartingParties(preset: string | null | undefined): boolean {
  return (
    typeof preset === "string" &&
    preset !== "" &&
    !isExcludedPreset(NO_STARTING_PARTIES_EXCLUSIONS, preset)
  );
}
