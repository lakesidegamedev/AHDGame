"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { SeatCycle } from "@/lib/campaignManager/rules";

/**
 * Every cycle of the selected race's seat, newest first, for the header arrows
 * and the past-races list. `version` (a turn) refetches; the last list stays
 * on screen while the next loads.
 */
export function useSeatHistory(
  electionId: string | null,
  version: number
): { cycles: SeatCycle[]; loading: boolean } {
  const [state, setState] = useState<{ key: string; cycles: SeatCycle[] } | null>(null);
  const key = electionId ? `${electionId}|${version}` : null;

  useEffect(() => {
    if (!electionId || !key) return;
    let live = true;
    const controller = new AbortController();
    fetchJson<{ cycles?: SeatCycle[] }>(
      `/api/elections/${encodeURIComponent(electionId)}/seat-history`,
      { signal: controller.signal, feature: "campaign-manager-seat-history" }
    )
      .then((data) => {
        if (live) setState({ key, cycles: data.cycles ?? [] });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // History is a garnish on the race: a failed read shows no arrows or list.
        console.warn("Campaign Manager: seat history unavailable", err);
        if (live) setState({ key, cycles: [] });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [electionId, key]);

  // Keep the seat's list across a refetch of the same seat, never another seat's.
  const cycles =
    state && electionId && state.cycles.some((c) => c.electionId === electionId)
      ? state.cycles
      : [];
  return { cycles, loading: !!key && state?.key !== key };
}
