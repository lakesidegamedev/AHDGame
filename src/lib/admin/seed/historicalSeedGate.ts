/**
 * Gate that decides whether a bootstrap run seeds the preset's authored
 * historical officeholder roster (seedHistoricalOfficials -> getPresetSeats).
 *
 * The gate's intent is: only seat the historical world when the world is
 * genuinely empty, never double-seat on top of an existing population. The
 * counts must be snapshotted BEFORE any seeder in this run has written, which is
 * what preExistingOfficials and preExistingNpps mean. Counts taken mid-bootstrap
 * see rows inserted by earlier seeders, so a genuinely fresh world always fails
 * the emptiness check and the roster never seeds.
 *
 * Re-running the seed is safe regardless: seedHistoricalOfficials passes
 * skipAlreadySeatedChambers, so an already-seated chamber converges instead of
 * appending a second parallel roster.
 */

import type { BootstrapMode } from "@/lib/admin/bootstrapGameWorld";

export type HistoricalSeedGateInput = {
  /** `"vacant"` worlds get `initializeOfficials` instead — never the roster. */
  mode: BootstrapMode;
  /**
   * Pre-iteration founding reset. Always seeds, in `"priors"` mode: that only
   * creates the unseated candidate pool (no `electedOfficials`), so there is no
   * double-seat risk even when country seeders already ran.
   */
  preIteration: boolean;
  /**
   * `electedOfficials` count captured BEFORE any seeder in this bootstrap run.
   * Must NOT be re-read mid-run — that is the bug documented above.
   */
  preExistingOfficials: number;
  /** Live (`retiredAt: null`) `npps` count captured before any seeder ran. */
  preExistingNpps: number;
};

export function shouldSeedHistoricalOfficials(input: HistoricalSeedGateInput): boolean {
  if (input.mode === "vacant") return false;
  if (input.preIteration) return true;
  return input.preExistingOfficials === 0 && input.preExistingNpps === 0;
}
