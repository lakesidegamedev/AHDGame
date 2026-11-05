"use client";

import { apiErrorText } from "@/lib/errors/catalog";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { resolveElectionYear } from "@/lib/utils/formatters";
import { Modal, Skeleton } from "@/components/ui";
import { TargetedAdsPanel } from "@/app/campaign/[id]/components/TargetedAdsPanel";
import { SuspendEndorsePanel } from "@/app/campaign/[id]/components/SuspendEndorsePanel";
import { CampaignRoomBriefing } from "@/app/campaign/[id]/components/CampaignRoomBriefing";
import { CampaignBlendClient } from "@/app/campaign/[id]/blend/CampaignBlendClient";
import { BLEND, BLEND_CONTAINER, FONT, BLEND_LABEL } from "@/components/blend/tokens";
import { raceHref } from "@/lib/campaignManager/links";

// The canvass panel and the running-mate surrogate block sit below the main
// campaign view and only render for the campaign manager or a surrogate. The
// canvass drags the demographic category catalog and the per-country archetype
// weights in, so both mount on demand behind a card skeleton.
const PanelFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-32 w-full rounded-lg" />
  </div>
);
const CanvassingPanel = dynamic(
  () =>
    import("@/app/campaign/[id]/components/CanvassingPanel").then((m) => ({
      default: m.CanvassingPanel,
    })),
  { loading: PanelFallback }
);
const RunningMateSurrogatePanel = dynamic(
  () =>
    import("@/app/campaign/[id]/components/RunningMateSurrogatePanel").then((m) => ({
      default: m.RunningMateSurrogatePanel,
    })),
  { loading: PanelFallback }
);
import { BlendScope } from "@/components/blend/BlendScope";
import { useCampaignDesk, type CampaignDesk } from "./useCampaignDesk";

/**
 * Where the workspace sits. `page` is the standalone route with its own
 * background and back link; `embedded` is the Political Operations iframe, which
 * supplies its own framing; `inline` sits inside the race page's Campaign mode,
 * under the race stage.
 */
export type CampaignWorkspaceVariant = "page" | "embedded" | "inline";

/**
 * The campaign desk for one campaign: data, access logic, the Blend panels, the
 * retarget and opposition reset controls. It renders without page chrome of its
 * own, so the standalone route and the race page's Campaign mode share it.
 */
export function CampaignWorkspace({
  campaignId,
  variant = "page",
}: {
  campaignId: string;
  variant?: CampaignWorkspaceVariant;
}) {
  const desk = useCampaignDesk(campaignId);
  return <CampaignDeskView desk={desk} variant={variant} />;
}

/**
 * The desk's panes for data that is already loaded. The race page loads the data
 * itself so the presidential map's state panel can act on the same campaign.
 * `stateActionsOnMap` hands the state operations and presence controls to that
 * map on desktop; phones and races without the map keep them here.
 */
export function CampaignDeskView({
  desk,
  variant = "page",
  stateActionsOnMap = false,
}: {
  desk: CampaignDesk;
  variant?: CampaignWorkspaceVariant;
  stateActionsOnMap?: boolean;
}) {
  const fillsScreen = variant === "page";
  const { campaign, loading, error, me, currentTurn, wire, canManage, canSurrogate } = desk;
  const { refresh: fetchCampaign, refreshMe: fetchMe } = desk;
  const myFunds = me.funds;
  const myStoredFunds = me.storedFunds;
  const myFundsCurrency = me.fundsCurrency;
  const myActions = me.actions;
  const myNationalInfluence = me.nationalInfluence;
  const myCountryId = me.countryId;
  const [resetOppoOpen, setResetOppoOpen] = useState(false);
  const [resetOppoBusy, setResetOppoBusy] = useState(false);
  const [resetOppoError, setResetOppoError] = useState("");

  async function handleRetarget(targetId: string) {
    if (!campaign) return;
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/retarget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(apiErrorText(data, "Retarget failed"));
        return;
      }
      await fetchCampaign();
    } catch {
      alert("Retarget failed");
    }
  }

  function openResetOpposition() {
    setResetOppoError("");
    setResetOppoOpen(true);
  }

  async function confirmResetOpposition() {
    if (!campaign) return;
    setResetOppoBusy(true);
    setResetOppoError("");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/opposition-research/reset`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResetOppoError(apiErrorText(data, "Reset failed"));
        return;
      }
      setResetOppoOpen(false);
      await fetchCampaign();
    } catch {
      setResetOppoError("Network error");
    } finally {
      setResetOppoBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        className={fillsScreen ? "min-h-screen" : ""}
        style={{ background: BLEND.page, color: BLEND.ink }}
      >
        <div className={BLEND_CONTAINER}>
          <Skeleton className="h-3 w-40" />
          <div className="mt-4">
            <Skeleton className="h-8 w-72" />
          </div>
          <div className="mt-3">
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
        <div
          className={BLEND_CONTAINER}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            borderTop: `1px solid ${BLEND.hairlineStrong}`,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                padding: "16px 20px",
                ...(i < 3 ? { borderRight: `1px solid ${BLEND.hairline}` } : {}),
              }}
            >
              <Skeleton className="h-2.5 w-20" />
              <div className="mt-2">
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="mt-2">
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
        <div className={BLEND_CONTAINER}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "14px 0", borderBottom: "1px solid rgba(42,42,61,.6)" }}>
              <Skeleton className="h-5 w-56" />
              <div className="mt-2">
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div
        className={fillsScreen ? "min-h-screen" : ""}
        style={{ background: BLEND.page, color: BLEND.ink }}
      >
        <div className={BLEND_CONTAINER} style={{ paddingTop: 48, paddingBottom: 48 }}>
          <div
            style={{
              padding: "14px 18px",
              background: "rgba(255,255,255,.02)",
              fontFamily: FONT.sans,
              fontSize: 15,
              color: BLEND.negative,
            }}
          >
            {error || "Campaign not found"}
          </div>
          <Link
            href="/elections"
            style={{ ...BLEND_LABEL, display: "inline-block", marginTop: 16 }}
          >
            &lsaquo; Back to elections
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = campaign.accessLevel === "owner";
  const electionYear = campaign.electionInfo
    ? resolveElectionYear({
        electionType: campaign.electionInfo.electionType,
        cycle: campaign.electionInfo.cycle,
        electionYear: campaign.electionInfo.electionYear,
        senateClass: campaign.electionInfo.senateClass,
        chamberClass: (campaign.electionInfo as { chamberClass?: number | null }).chamberClass,
      })
    : null;

  return (
    <div
      className={fillsScreen ? "min-h-screen" : ""}
      style={{ background: BLEND.page, color: BLEND.ink }}
    >
      {variant === "page" && campaign.electionInfo && (
        <div
          className={BLEND_CONTAINER}
          style={{ ...BLEND_LABEL, paddingTop: 14, paddingBottom: 14 }}
        >
          <Link
            href={raceHref({
              id: String(campaign.electionId),
              electionType: campaign.electionInfo.electionType,
            })}
            style={{ color: BLEND.muted }}
          >
            &lsaquo; {campaign.electionInfo.state}{" "}
            {campaign.electionInfo.electionType === "president"
              ? "Presidential"
              : campaign.electionInfo.electionType}{" "}
            Election{electionYear ? ` ${electionYear}` : ""}
          </Link>
        </div>
      )}

      {campaign.isArchived && (
        <div
          className={BLEND_CONTAINER}
          style={{
            paddingTop: 12,
            paddingBottom: 12,
            fontFamily: FONT.sans,
            fontSize: 14,
            color: BLEND.muted,
          }}
        >
          <span style={{ color: BLEND.ink, fontWeight: 600 }}>Campaign concluded.</span> This
          candidate is no longer in the race, so the campaign is read only. Funds, actions and
          upgrades can no longer be changed.
        </div>
      )}

      <CampaignBlendClient
        campaign={campaign}
        me={{
          funds: myFunds,
          storedFunds: myStoredFunds,
          actions: myActions,
          nationalInfluence: myNationalInfluence,
          fundsCurrency: myFundsCurrency,
          countryId: myCountryId,
        }}
        currentTurn={currentTurn}
        wire={wire}
        canManage={canManage}
        canSurrogate={canSurrogate}
        stateOps={desk.stateOps}
        stateActionsOnMap={stateActionsOnMap}
        onRefresh={fetchCampaign}
        onRefreshMe={fetchMe}
        onRetarget={canManage ? handleRetarget : undefined}
      />

      {/*
        Deviation D11: these four surfaces exist on the live page but have no
        counterpart in the Proposal D mockup. Removing them would delete working
        affordances, so they are retained below the Blend body in their current
        styling. Restyling them into Blend is follow-up work.
      */}
      {(canManage && campaign.briefing) ||
      (isOwner && campaign.electionInfo?.electionType === "president" && !campaign.isArchived) ||
      (canSurrogate && campaign.runningMateSurrogate) ||
      (canManage && campaign.electionInfo && !campaign.electionInfo.isEnded) ? (
        <BlendScope title="Also on this campaign">
          {isOwner &&
            campaign.electionInfo?.electionType === "president" &&
            !campaign.isArchived && (
              <SuspendEndorsePanel
                campaignId={campaign.id}
                campaignSuspended={campaign.campaignSuspended === true}
                suspendedAt={campaign.suspendedAt}
                endorsedCandidate={campaign.endorsedCandidate}
                endorsementTargetWithdrawn={campaign.endorsementTargetWithdrawn}
                suspendEndorse={campaign.suspendEndorse}
                onRefresh={fetchCampaign}
              />
            )}

          {canManage && campaign.briefing && <CampaignRoomBriefing campaign={campaign} />}

          {canSurrogate &&
            campaign.runningMateSurrogate &&
            campaign.electionInfo &&
            !campaign.electionInfo.isEnded && (
              <RunningMateSurrogatePanel
                electionId={campaign.electionId}
                surrogate={campaign.runningMateSurrogate}
                countryId={myCountryId ?? undefined}
                characterActions={myActions ?? undefined}
                characterFunds={myFunds ?? undefined}
                onRefresh={fetchCampaign}
                onResourcesSpent={fetchMe}
              />
            )}

          {/* The control that sets your state lives in the right rail with the
              other things you can do about your standing. Canvassing stays
              here because it needs the room, and it names the state it is
              acting on, so it still reads on its own. */}
          {canManage && campaign.electionInfo && !campaign.electionInfo.isEnded && (
            <TargetedAdsPanel campaignId={campaign.id} onResourcesSpent={fetchMe} />
          )}
          {canManage && campaign.electionInfo && !campaign.electionInfo.isEnded && (
            <CanvassingPanel
              electionId={campaign.electionId}
              countryId={myCountryId ?? undefined}
              characterActions={myActions ?? undefined}
              characterFunds={myFunds ?? undefined}
              onResourcesSpent={fetchMe}
            />
          )}

          {canManage && (
            <button
              type="button"
              onClick={openResetOpposition}
              style={{
                marginTop: 8,
                border: `1px solid ${BLEND.hairlineStrong}`,
                background: "transparent",
                padding: "8px 14px",
                fontFamily: FONT.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                fontWeight: 700,
                color: BLEND.muted,
                cursor: "pointer",
              }}
            >
              RESET OPPOSITION RESEARCH
            </button>
          )}
        </BlendScope>
      ) : null}

      <Modal
        open={resetOppoOpen}
        title="Reset Opposition Research?"
        onClose={() => {
          if (!resetOppoBusy) setResetOppoOpen(false);
        }}
      >
        <div className="space-y-3 text-sm">
          <p>
            This will set Opposition Research back to <span className="font-semibold">level 0</span>
            , clear the current target
            {campaign.oppositionTargetName ? (
              <>
                {" "}
                (<span className="font-medium">{campaign.oppositionTargetName}</span>)
              </>
            ) : null}
            , and clear the retarget cooldown.
          </p>
          <p className="text-warning">
            Funds and actions you previously spent on Opposition Research will{" "}
            <span className="font-semibold">not</span> be refunded.
          </p>
          {resetOppoError && (
            <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-error">
              {resetOppoError}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setResetOppoOpen(false)}
            disabled={resetOppoBusy}
            className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-card/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmResetOpposition}
            disabled={resetOppoBusy}
            className="rounded-lg bg-error px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {resetOppoBusy ? "Resetting..." : "Reset to 0"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
