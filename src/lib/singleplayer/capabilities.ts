import pkg from "../../../package.json";
import { SEED_PRESET_IDS } from "@/lib/constants/turnTime";
import { getCountryDisplayName } from "@/lib/constants/countryClientConfig";
import { RULES_VERSION } from "@/lib/actions/sharedRules";
import { NPP_AUTONOMY_LEVELS } from "@/lib/nppAutonomy/levels";
import { checkSeedContract } from "@/lib/seeds/contract/checkSeedContract";
import { SINGLEPLAYER_FEATURE_FLAGS } from "@/lib/singleplayerFeatureFlags";
import { countriesByTier, type CountryEraTier } from "@/lib/world/eraRoster";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { SingleplayerDifficulty, SingleplayerMode } from "@/lib/db/types";

export const SINGLEPLAYER_CAPABILITIES_SCHEMA_VERSION = 1;
export const SINGLEPLAYER_CAPABILITIES_FILE = "singleplayer-capabilities.json";

const MODES = [
  "normal",
  "head-of-state",
  "worldsim",
] as const satisfies readonly SingleplayerMode[];
const DIFFICULTIES = [
  "easy",
  "normal",
  "hard",
] as const satisfies readonly SingleplayerDifficulty[];

export const DEFAULT_SINGLEPLAYER_PRESET = "2027-default";
export const DEFAULT_SINGLEPLAYER_AUTONOMY_LEVEL = "v6";

export interface CapabilityCountry {
  id: string;
  name: string;
}

export interface SingleplayerPresetCapability {
  preset: string;
  era: string;
  /** False when the seed contract has gaps, so a world cannot be started on this game version. */
  seedable: boolean;
  playerCountries: CapabilityCountry[];
  computerCountries: CapabilityCountry[];
  backgroundCountries: CapabilityCountry[];
}

export interface SingleplayerCapabilities {
  schemaVersion: number;
  gameVersion: string;
  rulesVersion: string;
  defaultPreset: string;
  presets: SingleplayerPresetCapability[];
  modes: SingleplayerMode[];
  difficulties: SingleplayerDifficulty[];
  autonomyLevels: string[];
  defaultAutonomyLevel: string;
  featureFlags: {
    key: string;
    label: string;
    description: string;
    defaultEnabled: boolean;
  }[];
}

function countriesAt(
  preset: (typeof SEED_PRESET_IDS)[number],
  tiers: CountryEraTier[]
): CapabilityCountry[] {
  return tiers
    .flatMap((tier) => countriesByTier(preset, tier))
    .map((id: CountryId) => ({ id, name: getCountryDisplayName(id, preset) }));
}

function presetCapability(preset: (typeof SEED_PRESET_IDS)[number]): SingleplayerPresetCapability {
  const seedable = checkSeedContract(preset).length === 0;
  const empty = !seedable;
  return {
    preset,
    era: preset.split("-")[0],
    seedable,
    playerCountries: empty ? [] : countriesAt(preset, ["player"]),
    computerCountries: empty ? [] : countriesAt(preset, ["econ", "npp"]),
    backgroundCountries: empty ? [] : countriesAt(preset, ["background"]),
  };
}

/** What this game build can start, derived from the same sources setup validates against. */
export function buildSingleplayerCapabilities(): SingleplayerCapabilities {
  return {
    schemaVersion: SINGLEPLAYER_CAPABILITIES_SCHEMA_VERSION,
    gameVersion: pkg.version,
    rulesVersion: RULES_VERSION,
    defaultPreset: DEFAULT_SINGLEPLAYER_PRESET,
    presets: SEED_PRESET_IDS.map(presetCapability),
    modes: [...MODES],
    difficulties: [...DIFFICULTIES],
    autonomyLevels: [...NPP_AUTONOMY_LEVELS],
    defaultAutonomyLevel: DEFAULT_SINGLEPLAYER_AUTONOMY_LEVEL,
    featureFlags: SINGLEPLAYER_FEATURE_FLAGS.map(({ key, label, description, defaultEnabled }) => ({
      key,
      label,
      description,
      defaultEnabled,
    })),
  };
}
