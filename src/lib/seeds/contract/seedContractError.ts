/**
 * The seed contract: every value a preset seeds is authored for that preset.
 * A gap is never filled from another preset. It stops the seed with this error,
 * which names the preset and every dataset that is missing or out of band.
 */

export interface SeedContractGap {
  /** Registry dataset id, or the seed lane label for a direct lookup. */
  readonly dataset: string;
  /** What is wrong, in one line. */
  readonly detail: string;
}

export class SeedContractError extends Error {
  readonly preset: string;
  readonly gaps: readonly SeedContractGap[];

  constructor(preset: string, gaps: readonly SeedContractGap[]) {
    const lines = gaps.map((gap) => `  - ${gap.dataset}: ${gap.detail}`);
    super(`Seed contract failed for preset "${preset}" (${gaps.length}):\n${lines.join("\n")}`);
    this.name = "SeedContractError";
    this.preset = preset;
    this.gaps = gaps;
  }
}

/** Shorthand for a lookup that has no entry for the preset. */
export function missingPresetEntry(preset: string, dataset: string): SeedContractError {
  return new SeedContractError(preset, [
    { dataset, detail: `no authored entry for ${preset}; other presets are never borrowed` },
  ]);
}
