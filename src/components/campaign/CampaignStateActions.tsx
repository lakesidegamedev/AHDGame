"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BlendScopeInline } from "@/components/blend/BlendScope";
import { BLEND } from "@/components/blend/tokens";
import { Skeleton } from "@/components/ui";
import { StatePresencePanel } from "@/app/campaign/[id]/components/StatePresencePanel";
import { StateOperationsHere } from "@/app/campaign/[id]/components/StateOperationsSection";
import { MyCampaignStateBlock, type MyCampaign } from "@/app/elections/[id]/blend/useMyCampaign";
import { stateActionSections } from "@/lib/campaignManager/mapActions";
import type { CampaignStatePresence } from "@/lib/elections/dto/campaignStatePresence";
import type { PrimaryStateActionKind } from "@/lib/db/types";
import { apiErrorText } from "@/lib/errors/catalog";
import type { CampaignDesk } from "./useCampaignDesk";

// Canvassing drags the demographic catalog in, so it mounts on demand.
const CanvassingPanel = dynamic(
  () =>
    import("@/app/campaign/[id]/components/CanvassingPanel").then((m) => ({
      default: m.CanvassingPanel,
    })),
  { loading: () => <Skeleton className="h-32 w-full rounded-lg" /> }
);

function Divider() {
  return <div style={{ marginTop: 16, borderTop: `1px solid ${BLEND.hairline}` }} />;
}

/**
 * The campaign being viewed, acted on from one state of the presidential map.
 * Travel or camping, that state's operations and canvassing, each shown only
 * when the server sent the viewer the data for it: the state presence payload
 * is the candidate's alone, the operations hub answers a candidate alone, and
 * canvassing follows the same manage access the desk uses. A rival or party
 * viewer gets nothing here, so the map's public state overview stands alone.
 */
export function CampaignStateActions({
  desk,
  stateId,
  stateName,
  mine,
}: {
  desk: CampaignDesk;
  stateId: string;
  stateName: string;
  /** The map's presence layer for this campaign; drives the "your campaign here" block. */
  mine: MyCampaign | null;
}) {
  const { campaign, stateOps } = desk;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!campaign) return null;

  const ops = stateOps.view;
  // The hub carries the same camp data the presence payload does; use it when
  // the presence payload is missing so camping never drops out of reach.
  const presence: CampaignStatePresence | null =
    campaign.statePresence ??
    (ops
      ? {
          electionId: ops.electionId,
          phase: "primary",
          currentStateId: null,
          currentStateName: null,
          playerActions: ops.positives.camp.playerActions,
          states: ops.positives.camp.states,
          primary: ops.positives.camp,
        }
      : null);

  const show = stateActionSections({
    stateId,
    accessLevel: campaign.accessLevel,
    hasStatePresence: presence !== null,
    hasOperations: ops !== null,
    canManage: desk.canManage,
    canvassStateId: desk.canvassStateId,
  });

  const changed = () => {
    void desk.refresh();
    void desk.refreshMe();
    stateOps.reload();
  };

  const attack = async (
    targetCandidateId: string,
    kind: PrimaryStateActionKind,
    atState: string
  ) => {
    setBusy(`${targetCandidateId}:${kind}`);
    setError(null);
    try {
      const res = await fetch(`/api/elections/${campaign.electionId}/state-attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCandidateId, kind, stateId: atState }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(apiErrorText(data, "That did not work. Try again."));
        return;
      }
      changed();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!show.presenceBlock && !show.movement && !show.operations && !show.canvass) return null;

  return (
    <div data-testid="campaign-state-actions">
      {show.presenceBlock && mine ? <MyCampaignStateBlock mine={mine} stateId={stateId} /> : null}

      <BlendScopeInline>
        {show.movement ? (
          <div style={{ marginTop: 16 }}>
            <StatePresencePanel
              presence={presence}
              onChanged={changed}
              focusState={{ id: stateId, name: stateName }}
            />
          </div>
        ) : null}

        {show.operations && ops ? (
          <>
            <Divider />
            <div style={{ marginTop: 14 }}>
              <StateOperationsHere view={ops} stateId={stateId} busy={busy} onAttack={attack} />
              {error ? (
                <p
                  role="alert"
                  style={{ margin: "8px 0 0", fontSize: 12.5, color: BLEND.negative }}
                >
                  {error}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {show.canvass ? (
          <>
            <Divider />
            <div style={{ marginTop: 14 }} data-testid="state-canvass">
              <CanvassingPanel
                electionId={campaign.electionId}
                countryId={desk.me.countryId ?? undefined}
                characterActions={desk.me.actions ?? undefined}
                characterFunds={desk.me.funds ?? undefined}
                onResourcesSpent={() => void desk.refreshMe()}
              />
            </div>
          </>
        ) : null}
      </BlendScopeInline>
    </div>
  );
}
