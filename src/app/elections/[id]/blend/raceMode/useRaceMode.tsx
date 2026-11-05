"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CampaignWorkspace } from "@/components/campaign/CampaignWorkspace";
import { resolveRaceMode, type RaceModeState } from "@/lib/campaignManager/raceMode";
import { RaceModeSwitch } from "./RaceModeSwitch";
import type { RaceModeSlots } from "./RaceModeContext";

/**
 * Race / Campaign mode for a Blend presidential race, from the URL
 * (`?view=race|campaign`, `&campaign=<id>`) and the viewer's own campaign.
 * `enabled` is false for races that have no Blend views (Russia, down-ballot).
 */
export function useRaceMode(args: { enabled: boolean; myCampaignId: string | null | undefined }): {
  state: RaceModeState;
  slots: RaceModeSlots;
} {
  const { enabled, myCampaignId } = args;
  const searchParams = useSearchParams();
  const view = searchParams?.get("view");
  const campaign = searchParams?.get("campaign");

  const state = useMemo(
    () =>
      enabled
        ? resolveRaceMode({ view, campaign, myCampaignId })
        : ({ mode: "race", campaignId: null, canSwitch: false } as RaceModeState),
    [enabled, view, campaign, myCampaignId]
  );

  const slots = useMemo<RaceModeSlots>(
    () => ({
      switcher: state.canSwitch ? <RaceModeSwitch mode={state.mode} /> : null,
      campaign:
        state.mode === "campaign" && state.campaignId ? (
          <CampaignWorkspace
            key={state.campaignId}
            campaignId={state.campaignId}
            variant="inline"
          />
        ) : null,
    }),
    [state]
  );

  return { state, slots };
}
