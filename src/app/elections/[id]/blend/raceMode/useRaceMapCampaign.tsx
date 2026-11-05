"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CampaignStateActions } from "@/components/campaign/CampaignStateActions";
import { presenceSubject } from "@/lib/campaignManager/mapActions";
import { MyCampaignStateBlock, useMyCampaign } from "../useMyCampaign";
import { STATE_NAMES } from "../presMap/usStates";
import type { FieldOfficeLayerConfig } from "../presMap/useFieldOfficeLayer";
import { useRaceModeSlots } from "./RaceModeContext";
import type { ElectionDetail } from "../../components/ElectionDetailTypes";

/**
 * What the presidential map shows for the reader's campaign: the Campaign
 * Presence layer, and what the state panel appends.
 *
 * In Race mode that is the "your campaign here" block for anyone on a campaign
 * in the race (candidate, manager or running mate). In Campaign mode it is the
 * same block plus that campaign's own state actions, for whichever campaign is
 * being viewed. Viewing a rival's campaign adds nothing: the map shows its
 * public state overview alone.
 */
export function useRaceMapCampaign(election: ElectionDetail): {
  presence: { levels: Record<string, number>; color: string } | null;
  panelExtra: ((stateId: string) => ReactNode) | undefined;
  /**
   * The campaign on screen, for the map's field-office views. Set in Campaign
   * mode for any viewer when the race has field offices; the field-office route
   * decides what each viewer sees of them.
   */
  fieldOffices: FieldOfficeLayerConfig | null;
  /** The map sits in a page that scrolls (Campaign mode), so it must not take the wheel. */
  inPage: boolean;
} {
  const slots = useRaceModeSlots();
  const searchParams = useSearchParams();
  const desk = slots?.desk ?? null;
  const inPage = slots?.mapAbove ?? false;
  const inCampaignMode = desk !== null;
  const us = election.countryId === "US";

  // Campaign mode follows the campaign on screen and only if the viewer is on
  // it (owner access). Race mode follows the viewer's own campaign in the race.
  const followId = inCampaignMode
    ? desk.campaign?.accessLevel === "owner"
      ? desk.campaign.id
      : null
    : (election.myCampaignId ?? null);
  const subject = useMemo(
    () =>
      us && (!inCampaignMode || followId)
        ? presenceSubject(election.allCandidates, followId)
        : null,
    [us, inCampaignMode, followId, election.allCandidates]
  );

  const mine = useMyCampaign({
    enabled: subject !== null,
    campaignId: followId ?? election.allCandidates.find((c) => c.isYou)?.campaignId ?? null,
    race: election,
    color: subject?.color ?? "#4F8EF7",
    candidateId: subject?.candidateId ?? null,
    viewerIsCandidate: subject?.viewerIsCandidate ?? true,
    // Only the desk knows a manager from the running mate; Race mode cannot tell.
    canManage: inCampaignMode ? desk.canManage : false,
    canOpenFieldOffice: inCampaignMode ? desk.canManage : (subject?.viewerIsCandidate ?? true),
  });

  const presence = mine ? { levels: mine.levels, color: mine.color } : null;

  // `?tab=field&region=OH` (the old field tab link) opens the map on that
  // state in the field-office view.
  const fieldTab = searchParams?.get("tab") === "field";
  const hasFieldOffices = !!desk?.campaign?.electionInfo?.fieldOfficeScope;
  const refresh = desk?.refresh;
  const refreshMe = desk?.refreshMe;
  const fieldCampaignId = hasFieldOffices ? (desk?.campaign?.id ?? null) : null;
  const fieldOfficeCount = desk?.campaign?.electionInfo?.fieldOfficeCount ?? 0;
  const fieldOffices = useMemo<FieldOfficeLayerConfig | null>(
    () =>
      us && fieldCampaignId
        ? {
            campaignId: fieldCampaignId,
            version: fieldOfficeCount,
            startInFieldView: fieldTab,
            onChanged: () => {
              void refresh?.();
              void refreshMe?.();
            },
          }
        : null,
    [us, fieldCampaignId, fieldOfficeCount, fieldTab, refresh, refreshMe]
  );

  if (desk) {
    return {
      presence,
      fieldOffices,
      inPage,
      panelExtra: (stateId) => (
        <CampaignStateActions
          desk={desk}
          stateId={stateId}
          stateName={STATE_NAMES[stateId] ?? stateId}
          mine={mine}
        />
      ),
    };
  }
  return {
    presence,
    fieldOffices: null,
    inPage,
    panelExtra: mine
      ? (stateId) => <MyCampaignStateBlock mine={mine} stateId={stateId} />
      : undefined,
  };
}
