import { useCallback, type Dispatch, type SetStateAction } from "react";
import { partyApiUrl } from "@/lib/urls";
import type { PartyAnalyticsPayload } from "@/lib/partyAnalytics/types";
import type {
  UserData as NationalUserData,
  PartyData,
  NationalElectionsState,
  CommitteeData,
} from "./components/types";

interface Args {
  id: string;
  requestedCountry: string | null | undefined;
  modViewEnabled: boolean;
  setUser: Dispatch<SetStateAction<NationalUserData | null>>;
  setParty: Dispatch<SetStateAction<PartyData | null>>;
  setLinkedStateIds: Dispatch<SetStateAction<string[]>>;
  setElectionData: Dispatch<SetStateAction<NationalElectionsState | null>>;
  setCommitteeData: Dispatch<SetStateAction<CommitteeData | null>>;
  setEligibleStates: Dispatch<SetStateAction<Array<{ id: string; name: string }>>>;
  setAnalyticsData: Dispatch<SetStateAction<PartyAnalyticsPayload | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setMsg: Dispatch<SetStateAction<string>>;
}

/** Data loaders for the national party hub; a failed load reports through `setMsg`. */
export function usePartyHubLoaders({
  id,
  requestedCountry,
  modViewEnabled,
  setUser,
  setParty,
  setLinkedStateIds,
  setElectionData,
  setCommitteeData,
  setEligibleStates,
  setAnalyticsData,
  setLoading,
  setMsg,
}: Args) {
  const fetchUser = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
      }
    } catch {
      setMsg("✗ Could not load your account. Check your connection and refresh.");
    }
  }, [setMsg, setUser]);

  const fetchParty = useCallback(async () => {
    try {
      const url = partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id);
      const r = await fetch(url, { credentials: "same-origin" });
      if (r.ok) {
        const d = await r.json();
        setParty(d);
        const memberStates = [
          ...new Set(
            (d.members ?? [])
              .map((m: { homeState?: string }) => m.homeState)
              .filter(Boolean) as string[]
          ),
        ];
        setLinkedStateIds(memberStates);
      }
    } catch {
      setMsg("✗ Could not load party details. Check your connection and refresh.");
    } finally {
      setLoading(false);
    }
  }, [id, requestedCountry, setLinkedStateIds, setLoading, setMsg, setParty]);

  const fetchLinkedStates = useCallback(async () => {
    try {
      const r = await fetch(
        `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/state-parties`,
        { credentials: "same-origin" }
      );
      if (r.ok) {
        const d = await r.json();
        const ids = (d.rows ?? [])
          .filter((row: { hasPresence?: boolean }) => row.hasPresence)
          .map((row: { regionId: string }) => row.regionId);
        if (ids.length > 0) setLinkedStateIds(ids);
      }
    } catch {
      setMsg("✗ Could not load linked states. Check your connection and refresh.");
    }
  }, [id, requestedCountry, setLinkedStateIds, setMsg]);

  const fetchElections = useCallback(async () => {
    try {
      const r = await fetch(
        `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/election`,
        { credentials: "same-origin" }
      );
      if (r.ok) setElectionData(await r.json());
    } catch {
      setMsg("✗ Could not load party elections. Check your connection and refresh.");
    }
  }, [id, requestedCountry, setElectionData, setMsg]);

  const fetchCommittee = useCallback(async () => {
    try {
      const r = await fetch(
        `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/committee`,
        { credentials: "same-origin" }
      );
      if (r.ok) setCommitteeData(await r.json());
    } catch {
      setMsg("✗ Could not load committee details. Check your connection and refresh.");
    }
  }, [id, requestedCountry, setCommitteeData, setMsg]);

  const fetchEligibleStates = useCallback(async () => {
    try {
      const res = await fetch(
        `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/npp-influence-states`,
        { credentials: "same-origin" }
      );
      if (res.ok) {
        const data = await res.json();
        setEligibleStates(data.states ?? []);
      }
    } catch {
      setMsg("✗ Could not load eligible states. Check your connection and refresh.");
    }
  }, [id, requestedCountry, setEligibleStates, setMsg]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const analyticsUrl = modViewEnabled
        ? `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/analytics?modView=1`
        : `${partyApiUrl(requestedCountry?.toLowerCase() ?? "us", id)}/analytics`;
      const response = await fetch(analyticsUrl, { credentials: "same-origin" });
      if (!response.ok) return;
      const payload = (await response.json()) as PartyAnalyticsPayload;
      setAnalyticsData(payload);
    } catch {
      setMsg("✗ Could not load party analytics. Check your connection and refresh.");
    }
  }, [id, requestedCountry, modViewEnabled, setAnalyticsData, setMsg]);

  return {
    fetchUser,
    fetchParty,
    fetchLinkedStates,
    fetchElections,
    fetchCommittee,
    fetchEligibleStates,
    fetchAnalytics,
  };
}
