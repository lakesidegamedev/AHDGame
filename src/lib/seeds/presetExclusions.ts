/**
 * Default-on preset gating. A seed feature applies to every preset except the
 * ones listed with a reason, so a new era gets the feature without anyone
 * remembering to add it, and leaving it out is a recorded decision.
 *
 * Client-safe: no imports.
 */

export type PresetExclusions = Readonly<Record<string, string>>;

export function isExcludedPreset(exclusions: PresetExclusions, preset: string): boolean {
  return Object.prototype.hasOwnProperty.call(exclusions, preset);
}
