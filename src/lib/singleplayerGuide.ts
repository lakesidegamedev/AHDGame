import type { SingleplayerConfig, SingleplayerGuideState } from "@/lib/db/types/gameState";
import {
  isOnboardingStepComplete,
  type OnboardingCharacter,
  type OnboardingSignals,
} from "@/lib/onboarding/checklist";
import { partiesUrl } from "@/lib/urls";

/**
 * First-game guide for a new local world in normal mode.
 *
 * The step list is the part singleplayer adds on top of the onboarding
 * checklist (src/lib/onboarding/checklist.ts). Two steps reuse that checklist's
 * own completion rules, so "campaign" and "party" can never disagree with the
 * profile checklist about what counts as done. The other three (character,
 * end turn, inbox) only exist here: multiplayer has no turn button and no
 * character-less phase.
 *
 * Every step completes from real state, never from a click count:
 *  - character: a character exists in the world;
 *  - campaign: a Campaign action is in the action log;
 *  - party: the character belongs to a party;
 *  - end-turn: the world has moved past the turn the character was created on;
 *  - inbox: the player opened the inbox (recorded server-side on the world).
 */

export const SINGLEPLAYER_GUIDE_STEP_IDS = [
  "character",
  "campaign",
  "party",
  "end-turn",
  "inbox",
] as const;

export type SingleplayerGuideStepId = (typeof SINGLEPLAYER_GUIDE_STEP_IDS)[number];

export interface SingleplayerGuideStep {
  id: SingleplayerGuideStepId;
  done: boolean;
  /** Where the step's action lives. */
  href: string;
}

/** What the guide reads off the character; null before one exists. */
export type SingleplayerGuideCharacter = Pick<
  OnboardingCharacter,
  "countryId" | "party" | "currentOffice" | "careerHistory" | "onboarding"
> & {
  funds: number;
  actions: number;
  /** Turn the character was created on. Absent on documents that predate it. */
  createdTurn?: number;
};

export interface SingleplayerGuideInputs {
  config: Pick<SingleplayerConfig, "mode" | "guide"> | null;
  character: SingleplayerGuideCharacter | null;
  currentTurn: number;
  hasCampaignActed: boolean;
  /** Parties exist in the character's country, so joining one is possible. */
  partiesAvailable: boolean;
}

export interface SingleplayerGuide {
  /**
   * The world offers the guide, whether or not it is still showing. The
   * multiplayer tour's welcome prompt stays out of such a world, so closing the
   * guide does not hand the player a second walkthrough.
   */
  offered: boolean;
  /** False when the world does not offer the guide or the player is done with it. */
  active: boolean;
  steps: SingleplayerGuideStep[];
  /** Live numbers the copy quotes. Null before a character exists. */
  funds: number | null;
  actions: number | null;
}

/** The checklist signals the guide does not use, all false. */
const NO_SIGNALS: OnboardingSignals = {
  hasVoted: false,
  hasCandidacy: false,
  hasInvested: false,
  hasCampaignActed: false,
  hasCompany: false,
  hasUnion: false,
};

const inactive = (offered: boolean): SingleplayerGuide => ({
  offered,
  active: false,
  steps: [],
  funds: null,
  actions: null,
});

/** Whether this world offers the guide at all, before looking at progress. */
export function singleplayerGuideOffered(
  config: Pick<SingleplayerConfig, "mode" | "guide"> | null
): config is Pick<SingleplayerConfig, "mode" | "guide"> & { guide: SingleplayerGuideState } {
  return config?.mode === "normal" && typeof config.guide === "object" && config.guide !== null;
}

export function deriveSingleplayerGuide(input: SingleplayerGuideInputs): SingleplayerGuide {
  const { config, character } = input;
  if (!singleplayerGuideOffered(config)) return inactive(false);
  if (config.guide.dismissedAt !== undefined) return inactive(true);

  const signals = { ...NO_SIGNALS, hasCampaignActed: input.hasCampaignActed };
  const done: Record<SingleplayerGuideStepId, boolean> = {
    character: character !== null,
    campaign: character !== null && isOnboardingStepComplete("campaign-action", character, signals),
    party: character !== null && isOnboardingStepComplete("join-party", character, signals),
    // Created on turn N means the first End turn lands the world on N + 1.
    "end-turn":
      character !== null &&
      typeof character.createdTurn === "number" &&
      input.currentTurn > character.createdTurn,
    inbox: config.guide.inboxOpenedAt !== undefined,
  };

  const hrefs: Record<SingleplayerGuideStepId, string> = {
    character: "/create-character",
    campaign: "/actions",
    party: character ? partiesUrl(character.countryId) : "/",
    "end-turn": "/",
    inbox: "/notifications",
  };

  const steps = SINGLEPLAYER_GUIDE_STEP_IDS.filter(
    // Joining a party is only offered where there is one to join.
    (id) => id !== "party" || done.party || input.partiesAvailable
  ).map((id) => ({ id, done: done[id], href: hrefs[id] }));

  return {
    offered: true,
    active: true,
    steps,
    funds: character?.funds ?? null,
    actions: character?.actions ?? null,
  };
}

/** True when every step in the list is done. */
export function singleplayerGuideComplete(guide: SingleplayerGuide): boolean {
  return guide.active && guide.steps.length > 0 && guide.steps.every((s) => s.done);
}
