"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameEvents } from "@/hooks/useGameEvents";
import { fetchAllElections } from "@/lib/elections/fetchAllElections";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { buildRaceIndex, type CmRace } from "@/lib/campaignManager/rules";

/**
 * Every race in the player's country, rebuilt from the elections API. Reloads
 * when a turn completes (shares, phases and turns left all move) and whenever
 * the page asks, e.g. after the player acts on a candidate.
 */
export function useRaceIndex(
  countryId: string,
  nationalChamberKeys: readonly string[]
): {
  races: CmRace[];
  currentTurn: number | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [elections, setElections] = useState<ElectionResponse[]>([]);
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    void (async () => {
      const [result, turn] = await Promise.all([
        fetchAllElections(countryId, { signal: controller.signal }),
        // Turns left falls back to "unknown" when the turn read fails; the races still list.
        fetchJson<{ currentTurn?: number }>("/api/game/turn/status", {
          signal: controller.signal,
          feature: "campaign-manager-turn",
        }).catch((err: unknown) => {
          console.warn("Campaign Manager: turn status unavailable", err);
          return null;
        }),
      ]);
      if (!live) return;
      setElections(result.elections);
      setError(result.error ?? null);
      if (typeof turn?.currentTurn === "number") setCurrentTurn(turn.currentTurn);
      setLoading(false);
    })();
    return () => {
      live = false;
      controller.abort();
    };
  }, [countryId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useGameEvents(reload, ["turn_complete"]);

  const races = useMemo(
    () => buildRaceIndex(elections, { currentTurn, nationalChamberKeys, includeUpcoming: true }),
    [elections, currentTurn, nationalChamberKeys]
  );

  return { races, currentTurn, loading, error, reload };
}
