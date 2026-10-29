"use client";

import dynamic from "next/dynamic";

/**
 * Shell overlays that never contribute to first paint: the one-time stat gate,
 * season recap, turn-progress toast and tutorial coach. Each is event or state
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

export function DeferredStatAllocationGate() {
  return <StatAllocationGate />;
}

export function DeferredWealthTierRepickGate() {
  return <WealthTierRepickGate />;
}

export function DeferredSeasonRecapGate() {
  return <SeasonRecapGate />;
}

export function DeferredTurnProgressToast() {
  return <TurnProgressToast />;
}

export function DeferredTutorialCoachMount() {
  return <TutorialCoachMount />;
}
