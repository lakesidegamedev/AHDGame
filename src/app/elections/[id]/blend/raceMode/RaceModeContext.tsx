"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * What the presidential stage needs to offer Campaign mode: the Race / Campaign
 * switch for its header, and the campaign workspace that takes the place of the
 * race body. Passed by context so the three Blend views (primary, general,
 * concluded) share one mechanism instead of each growing the same two props.
 */
export interface RaceModeSlots {
  /** The Race / Campaign switch. Null when there is no campaign to show. */
  switcher: ReactNode;
  /** The campaign workspace. Set only while Campaign mode is on. */
  campaign: ReactNode | null;
}

const RaceModeContext = createContext<RaceModeSlots | null>(null);

export const RaceModeProvider = RaceModeContext.Provider;

export function useRaceModeSlots(): RaceModeSlots | null {
  return useContext(RaceModeContext);
}
