/**
 * Which `gameConfig` keys survive a world reset on purpose. Every other key is
 * either rewritten from the seed by the reset or must not exist; the rehearsal
 * gate fails when a non-survivor differs from the seed.
 */

export interface GameConfigSurvivor {
  reason: string;
  keys?: readonly string[];
  pattern?: RegExp;
}

export const GAME_CONFIG_SURVIVORS: readonly GameConfigSurvivor[] = Object.freeze([
  {
    reason: "Rollout stages and mode switches an operator turned on deliberately.",
    pattern: /(Stage|Mode)$/,
  },
  {
    reason: "Feature flags and their set-by and set-at provenance.",
    pattern: /Enabled(At|By)?$/,
  },
  {
    reason: "Maintenance and seal switches, the audit log and review mode.",
    pattern: /^(maintenance|auditLog|publicReviewMode)/,
  },
  {
    reason: "Operator choices that are not world state.",
    keys: [
      "firstJoinerBecomesPartyChair",
      "discordLinkRequiredForCharacter",
      "referralContestStartedAt",
      "savingsAccountsReadCurrencies",
    ],
  },
  {
    reason: "Discord integration endpoints and their owner service.",
    pattern: /^discord.*(Webhook|Owner)/,
  },
  {
    reason: "Economy tuning set deliberately by the owner; a duration or rate, not a turn anchor.",
    keys: [
      "dominanceRunningCostScale",
      "managementOverheadPpPerDoubling",
      "marketGovernorRampTurns",
      "nppInsolvencyGraceTurns",
      "producerLabourWageMaxShare",
      "producerPriceMaxMove",
      "producerPriceMaxMultiplier",
      "producerRunPaceDrop",
      "producerSalesAdvanceRevenueShare",
      "producerShortageAskMaxStep",
      "producerShortageBuildFactor",
      "producerStockCover",
      "soeSizeCostScale",
    ],
  },
  {
    reason: "Written by the reset itself: the run record and the per-world roster and stamps.",
    keys: [
      "_id",
      "createdAt",
      "updatedAt",
      "lastReset",
      "seedYear",
      "seedRosterUpkeep",
      "commandEconomyEnabledAt",
    ],
  },
]);

export function gameConfigKeySurvives(key: string): boolean {
  return GAME_CONFIG_SURVIVORS.some((s) => s.keys?.includes(key) || s.pattern?.test(key));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keys of the live config that still differ from the seed and are not survivors:
 * a seed-defined key holding another value, or a key the seed does not define.
 */
export function gameConfigResidue(
  config: Readonly<Record<string, unknown>>,
  seed: Readonly<Record<string, unknown>>
): string[] {
  const residue: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (gameConfigKeySurvives(key)) continue;
    if (!(key in seed) || !same(value, seed[key])) residue.push(key);
  }
  return residue.sort();
}
