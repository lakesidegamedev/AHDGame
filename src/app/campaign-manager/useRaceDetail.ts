"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import type { RaceWireItem } from "@/lib/elections/raceWireFeed";

interface DetailState {
  id: string | null;
  version: number;
  full: ElectionResponse | null;
  wire: RaceWireItem[];
  error: boolean;
}

/**
 * The selected race's full view (turn-by-turn polling) and its wire. `version`
 * is bumped by the page after a turn or an action so both refresh in place,
 * keeping the last good data on screen while the refresh is in flight.
 */
export function useRaceDetail(
  electionId: string | null,
  version: number
): { full: ElectionResponse | null; wire: RaceWireItem[]; loading: boolean; error: boolean } {
  const [state, setState] = useState<DetailState>({
    id: null,
    version: -1,
    full: null,
    wire: [],
    error: false,
  });

  useEffect(() => {
    if (!electionId) return;
    let live = true;
    const controller = new AbortController();
    const id = encodeURIComponent(electionId);
    void (async () => {
      try {
        const [detail, wire] = await Promise.all([
          fetchJson<{ election?: ElectionResponse }>(`/api/elections?id=${id}&view=full`, {
            signal: controller.signal,
            feature: "campaign-manager-race",
          }),
          // The wire is a garnish: a failed read shows an empty strip, not an error.
          fetchJson<{ items?: RaceWireItem[] }>(`/api/elections/${id}/wire?limit=20`, {
            signal: controller.signal,
            feature: "campaign-manager-wire",
          }).catch((err: unknown) => {
            console.warn("Campaign Manager: race wire unavailable", err);
            return { items: [] };
          }),
        ]);
        if (live)
          setState({
            id: electionId,
            version,
            full: detail.election ?? null,
            wire: wire.items ?? [],
            error: false,
          });
      } catch (err) {
        if (!live) return;
        console.warn("Campaign Manager: race detail unavailable", err);
        setState((s) => ({ ...s, id: electionId, version, error: true }));
      }
    })();
    return () => {
      live = false;
      controller.abort();
    };
  }, [electionId, version]);

  if (!electionId) return { full: null, wire: [], loading: false, error: false };
  const sameRace = state.id === electionId;
  return {
    full: sameRace ? state.full : null,
    wire: sameRace ? state.wire : [],
    loading: !sameRace || state.version !== version,
    error: sameRace && state.error,
  };
}
