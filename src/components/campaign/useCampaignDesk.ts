"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import { canvassStateFromEligibility } from "@/lib/campaignManager/mapActions";
import type { CampaignData } from "@/lib/campaigns/dto/campaignView";
import type { StateOperationsView } from "@/lib/elections/dto/stateOperations";
import type { CurrencyCode } from "@/lib/constants/currencies";

/**
 * The state operations hub for the signed-in candidate. Fetched on its own so an
 * attack can refresh it without a full round trip. Keyed by election and read
 * back through a match, so a response for a race the viewer has left cannot
 * paint over the one they are looking at.
 */
export function useStateOperations(electionId: string | null | undefined, enabled = true) {
  const [ops, setOps] = useState<{ key: string; view: StateOperationsView } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const key = electionId ?? "";
  const view = ops && ops.key === key ? ops.view : null;

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/elections/${key}/state-operations`);
        // 404 is the ordinary answer for a race with nothing to act on (a
        // general election, a non-US seat, a viewer who is not a candidate).
        if (!res.ok) return;
        const payload = (await res.json()) as StateOperationsView | null;
        // A 200 carrying something else is not the hub. Rendering it would
        // throw inside the section and take the whole manager down with it.
        if (!payload?.positives?.camp) return;
        if (!cancelled) setOps({ key, view: payload });
      } catch {
        // Non-critical: the section stays hidden and the rest of the page stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key, reloadKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  return { view, reload };
}

/** The viewer's own resources, as the campaign panels spend them. */
export interface DeskViewer {
  funds: number | null;
  storedFunds: number | null;
  fundsCurrency: CurrencyCode | null;
  actions: number | null;
  nationalInfluence: number | null;
  countryId: string | null;
  characterId: string | null;
}

export interface CampaignDesk {
  campaignId: string;
  campaign: CampaignData | null;
  loading: boolean;
  error: string;
  me: DeskViewer;
  currentTurn: number | null;
  wire: string[];
  /** Full manage surface: manager or nominee, not a running mate, not archived or suspended. */
  canManage: boolean;
  /** Running-mate surrogate actions. */
  canSurrogate: boolean;
  stateOps: ReturnType<typeof useStateOperations>;
  /** The one state canvassing is open in for the viewer, or null. */
  canvassStateId: string | null;
  refresh: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

/**
 * The campaign desk's data for one campaign: the campaign itself, the viewer's
 * resources, the turn, the race wire and the state operations hub. Shared by the
 * workspace panes and by the presidential map's state panel, so both read one
 * copy and one refresh. Pass null to hold off loading (a race with no campaign
 * to show).
 */
export function useCampaignDesk(campaignId: string | null): CampaignDesk {
  const id = campaignId ?? "";
  const [loaded, setLoaded] = useState<{ id: string; campaign: CampaignData } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [settledId, setSettledId] = useState<string | null>(null);
  const [me, setMe] = useState<DeskViewer>({
    funds: null,
    storedFunds: null,
    fundsCurrency: null,
    actions: null,
    nationalInfluence: null,
    countryId: null,
    characterId: null,
  });
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  const [wireState, setWireState] = useState<{ electionId: string; items: string[] } | null>(null);
  const [canvassStateId, setCanvassStateId] = useState<string | null>(null);

  const campaign = loaded && loaded.id === id ? loaded.campaign : null;
  const error = failure && failure.id === id ? failure.message : "";
  const loading = Boolean(id) && settledId !== id;

  const fetchCampaign = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) {
        const data = await res.json();
        setFailure({ id, message: apiErrorText(data, "Failed to load campaign") });
        return;
      }
      const data = await res.json();
      setLoaded({ id, campaign: data.campaign });
      setFailure(null);
    } catch {
      setFailure({ id, message: "Network error" });
    } finally {
      setSettledId(id);
    }
  }, [id]);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = await res.json();
      const meCharacter = data?.user?.character;
      // Prefer the stored local balance over the legacy anchor mirror, which drifts under floating FX and can block actions.
      const storedOrLegacy = meCharacter?.campaignFundsStored ?? meCharacter?.funds ?? null;
      setMe({
        funds: storedOrLegacy,
        storedFunds: storedOrLegacy,
        fundsCurrency: (meCharacter?.homeCurrency as CurrencyCode | undefined) ?? null,
        actions: meCharacter?.actions ?? null,
        nationalInfluence: meCharacter?.nationalInfluence ?? null,
        countryId: (meCharacter?.countryId as string | undefined) ?? null,
        characterId: (meCharacter?.id as string | undefined) ?? null,
      });
    } catch {
      // non-critical: contribute card just shows "—" for available balance
    }
  }, []);

  const fetchTurn = useCallback(async () => {
    try {
      const res = await fetch("/api/game/turn/status");
      if (!res.ok) return;
      const data = await res.json();
      setCurrentTurn(typeof data?.currentTurn === "number" ? data.currentTurn : null);
    } catch {
      // non-critical: the masthead simply omits the turn readout
    }
  }, []);

  // Per-race wire headlines for the ticker. A quiet race returns an empty list
  // and the strip renders nothing.
  const fetchWire = useCallback(async (electionId: string) => {
    try {
      const res = await fetch(`/api/elections/${electionId}/wire?limit=8`);
      if (!res.ok) return;
      const data = await res.json();
      setWireState({
        electionId,
        items: Array.isArray(data?.items)
          ? data.items.map((i: { headline: string }) => i.headline).filter(Boolean)
          : [],
      });
    } catch {
      // non-critical: the ticker stays hidden
    }
  }, []);

  const fetchCanvass = useCallback(async () => {
    try {
      const res = await fetch("/api/canvassing/eligibility");
      setCanvassStateId(res.ok ? canvassStateFromEligibility(await res.json()) : null);
    } catch {
      setCanvassStateId(null);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchCampaign();
    fetchMe();
    fetchTurn();
  }, [id, fetchCampaign, fetchMe, fetchTurn]);

  const electionId = campaign?.electionId ?? null;
  useEffect(() => {
    if (electionId) fetchWire(electionId);
  }, [electionId, fetchWire]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      fetchCampaign();
      fetchTurn();
    }, 60_000);
    return () => clearInterval(t);
  }, [id, fetchCampaign, fetchTurn]);

  // Archived (primary loser / withdrawn) campaigns are viewable as history but
  // not manageable. A running mate has owner-level VIEW but not full manage:
  // their narrower surrogate action set is gated on canSurrogate, and the
  // server enforces the same split.
  const isOwner = campaign?.accessLevel === "owner";
  const isRunningMate = campaign?.isRunningMate === true;
  const live = campaign ? !campaign.isArchived && !campaign.campaignSuspended : false;
  const canManage = isOwner && !isRunningMate && live;
  const canSurrogate = isRunningMate && live;

  // The candidate's own hub. Only a candidate gets an answer; anyone else is a 404.
  const stateOps = useStateOperations(campaign?.electionId, isOwner);

  // Where canvassing is open is the viewer's own question, answered per character.
  const canvassKnown = canManage && !campaign?.electionInfo?.isEnded;
  useEffect(() => {
    if (canvassKnown) void fetchCanvass();
    else setCanvassStateId(null);
  }, [canvassKnown, fetchCanvass, currentTurn]);

  return {
    campaignId: id,
    campaign,
    loading,
    error,
    me,
    currentTurn,
    wire: wireState && wireState.electionId === electionId ? wireState.items : [],
    canManage,
    canSurrogate,
    stateOps,
    canvassStateId,
    refresh: fetchCampaign,
    refreshMe: fetchMe,
  };
}
