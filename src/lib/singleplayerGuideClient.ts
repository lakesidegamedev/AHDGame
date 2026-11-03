import { useSyncExternalStore } from "react";

/**
 * Whether the local world offers the first-game guide, as last reported by the
 * guide component. `null` until the first answer. Shared module state so the
 * multiplayer tour's mount can stay quiet in such a world without making its
 * own request; see SingleplayerGuide in src/lib/singleplayerGuide.ts.
 */
let offered: boolean | null = null;
const listeners = new Set<() => void>();

export function reportSingleplayerGuideOffered(value: boolean): void {
  if (offered === value) return;
  offered = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSingleplayerGuideOffered(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => offered,
    () => null
  );
}
