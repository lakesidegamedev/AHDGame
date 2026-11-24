"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useHasSession, useOptionalAuthMe } from "@/contexts/AuthDataContext";

/**
 * Shell overlays that never contribute to first paint: the one-time stat gate,
 * season recap, turn-progress toast, singleplayer guide and tutorial coach. Each is event or state
 * driven, so shipping their markup and dependencies eagerly only delays the
 * page. The thin wrappers below are what the server layout imports.
 */
const StatAllocationGate = dynamic(
  () => import("@/components/stats/StatAllocationGate").then((m) => m.StatAllocationGate),
  { ssr: false }
);
const WealthTierRepickGate = dynamic(
  () => import("@/components/character/WealthTierRepickGate").then((m) => m.WealthTierRepickGate),
  { ssr: false }
);
const SeasonRecapGate = dynamic(
  () => import("@/components/recap/SeasonRecapGate").then((m) => m.SeasonRecapGate),
  { ssr: false }
);
const TurnProgressToast = dynamic(
  () => import("@/components/turn-progress/TurnProgressToast").then((m) => m.TurnProgressToast),
  { ssr: false }
);
const TutorialCoachMount = dynamic(
  () => import("@/components/tutorial/TutorialCoachMount").then((m) => m.TutorialCoachMount),
  { ssr: false }
);
const SingleplayerGuide = dynamic(
  () => import("@/components/singleplayer/SingleplayerGuide").then((m) => m.SingleplayerGuide),
  { ssr: false }
);
const NominationChoicePrompt = dynamic(
  () => import("@/components/cabinet/NominationChoicePrompt").then((m) => m.NominationChoicePrompt),
  { ssr: false }
);

// Keep the gate's in-flight work and dismissal state once it has been needed.
function useGateEnabled(eligible: boolean) {
  const [enabled, setEnabled] = useState(eligible);
  if (eligible && !enabled) setEnabled(true);
  return eligible || enabled;
}

export function DeferredStatAllocationGate() {
  const auth = useOptionalAuthMe();
  const enabled = useGateEnabled(Boolean(auth?.user?.character?.needsStatAllocation));
  return enabled ? <StatAllocationGate /> : null;
}

export function DeferredWealthTierRepickGate() {
  const auth = useOptionalAuthMe();
  const enabled = useGateEnabled(Boolean(auth?.user?.character?.needsWealthTierRepick));
  return enabled ? <WealthTierRepickGate /> : null;
}

export function DeferredSeasonRecapGate() {
  const auth = useOptionalAuthMe();
  const enabled = useGateEnabled(Boolean(auth?.navData?.pendingSeasonRecapId));
  return enabled ? <SeasonRecapGate /> : null;
}

export function DeferredTurnProgressToast() {
  return <TurnProgressToast />;
}

export function DeferredSingleplayerGuide() {
  return <SingleplayerGuide />;
}

export function DeferredTutorialCoachMount() {
  const enabled = useGateEnabled(useHasSession());
  return enabled ? <TutorialCoachMount /> : null;
}

export function DeferredNominationChoicePrompt() {
  const enabled = useGateEnabled(useHasSession());
  return enabled ? <NominationChoicePrompt /> : null;
}
