import { DEFAULT_GAME_STATE_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";

type BooleanDefaultKey = {
  [K in keyof typeof DEFAULT_GAME_STATE_FLAGS]: (typeof DEFAULT_GAME_STATE_FLAGS)[K] extends boolean
    ? K
    : never;
}[keyof typeof DEFAULT_GAME_STATE_FLAGS];
export type SingleplayerFeatureFlagKey = Exclude<
  BooleanDefaultKey,
  "nppAutonomyEnabled" | "frontierEntryExperimentEnabled" | "stateGdpAnchoredDemand"
>;

export interface SingleplayerFeatureFlagOption {
  key: SingleplayerFeatureFlagKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const LABELS: Record<SingleplayerFeatureFlagKey, string> = {
  forexEnabled: "Foreign exchange",
  playerRandomEventsEnabled: "Player random events",
  autoDisastersEnabled: "Automatic crises and disasters",
  sectorTechTreesEnabled: "Sector technology trees",
  eraSystemEnabled: "Era progression",
  coldWarEnabled: "Cold War systems",
  nppCorpStrategyEnabled: "Autonomous corporate strategy",
  livingConflictsEnabled: "Living conflicts",
  nppTurnoverEnabled: "Politician aging and retirement",
  nppPartyRenewalEnabled: "Party renewal",
};

const DESCRIPTIONS: Record<SingleplayerFeatureFlagKey, string> = {
  forexEnabled:
    "Currencies trade against each other, so exchange rates move with trade and policy and affect prices abroad.",
  playerRandomEventsEnabled:
    "Your politician can run into random events such as scandals, windfalls and personal setbacks.",
  autoDisastersEnabled:
    "Natural disasters and economic crises can strike on their own and force a response from governments.",
  sectorTechTreesEnabled:
    "Industries research new technology over time, which changes what they produce and what it costs.",
  eraSystemEnabled:
    "The world moves through historical eras as the years pass, changing rules and available options.",
  coldWarEnabled:
    "Superpower rivalry shapes alliances, arms spending and proxy conflicts in eras where it applies.",
  nppCorpStrategyEnabled:
    "Computer-run companies decide for themselves where to invest, expand and compete.",
  livingConflictsEnabled:
    "Wars and border disputes start, escalate and end on their own as the world changes.",
  nppTurnoverEnabled:
    "Computer-run politicians grow old, retire and die, and are replaced by younger members of their party.",
  nppPartyRenewalEnabled:
    "Computer-run parties can split, new parties can form in empty political ground, and parties under 2% fold.",
};

/**
 * Boolean local-world controls, derived from the same defaults persisted by
 * setSingleplayerConfig. New defaults therefore cannot silently miss setup UI.
 */
export const SINGLEPLAYER_FEATURE_FLAGS: readonly SingleplayerFeatureFlagOption[] = (
  Object.entries(DEFAULT_GAME_STATE_FLAGS) as [string, unknown][]
)
  .filter((entry): entry is [BooleanDefaultKey, boolean] => typeof entry[1] === "boolean")
  .filter(
    (entry): entry is [SingleplayerFeatureFlagKey, boolean] =>
      entry[0] !== "nppAutonomyEnabled" &&
      entry[0] !== "frontierEntryExperimentEnabled" &&
      // A unit correction, not a player-facing feature, so it is not a toggle.
      entry[0] !== "stateGdpAnchoredDemand"
  )
  .map(([key, defaultEnabled]) => ({
    key,
    label: LABELS[key],
    description: DESCRIPTIONS[key],
    defaultEnabled,
  }));

export const DEFAULT_SINGLEPLAYER_FEATURE_FLAGS: Record<SingleplayerFeatureFlagKey, boolean> =
  Object.fromEntries(
    SINGLEPLAYER_FEATURE_FLAGS.map(({ key, defaultEnabled }) => [key, defaultEnabled])
  ) as Record<SingleplayerFeatureFlagKey, boolean>;
