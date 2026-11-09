"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CampaignDeskView } from "@/components/campaign/CampaignWorkspace";
import { useCampaignDesk } from "@/components/campaign/useCampaignDesk";
import { campaignMapIsEntry } from "@/lib/campaignManager/mapActions";
import { resolveRaceMode, type RaceModeState } from "@/lib/campaignManager/raceMode";
import { RaceModeSwitch } from "./RaceModeSwitch";
import type { RaceModeSlots } from "./RaceModeContext";

/**
 * Race / Campaign mode for a Blend presidential race, from the URL
 * (`?view=race|campaign`, `&campaign=<id>`) and the viewer's own campaign.
 * `enabled` is false for races that have no Blend views (Russia, down-ballot).
 */
export function useRaceMode(args: {
  enabled: boolean;
  myCampaignId: string | null | undefined;
  countryId: string | null | undefined;
}): {
  state: RaceModeState;
  slots: RaceModeSlots;
} {
  const { enabled, myCampaignId, countryId } = args;
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

  const campaignOn = state.mode === "campaign" && state.campaignId !== null;
  const desk = useCampaignDesk(campaignOn ? state.campaignId : null);
  const mapAbove = campaignOn && campaignMapIsEntry(countryId);

  const slots = useMemo<RaceModeSlots>(
    () => ({
      switcher: state.canSwitch ? <RaceModeSwitch mode={state.mode} /> : null,
      campaign: campaignOn ? (
        <CampaignDeskView
          key={desk.campaignId}
          desk={desk}
          variant="inline"
          stateActionsOnMap={mapAbove}
        />
      ) : null,
      desk: campaignOn ? desk : null,
      mapAbove,
    }),
    [state, campaignOn, desk, mapAbove]
  );

  return { state, slots };
}
