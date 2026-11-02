"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAllElections } from "@/lib/elections/fetchAllElections";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { buildRaceIndex, type CmRace } from "@/lib/campaignManager/rules";

/** Finished races do not change, so one read per country and race type serves the visit. */
const cache = new Map<string, ElectionResponse[]>();

/**
 * Every finished race of one type in the player's country, as `final` rows.
 * Loaded only while `enabled` (the Finished stage, or a deep link into one).
 */
export function useFinishedRaces(
  countryId: string,
  type: string,
  enabled: boolean,
  nationalChamberKeys: readonly string[]
): { races: CmRace[]; loading: boolean } {
  const key = `${countryId}|${type}`;
  const [loaded, setLoaded] = useState<{ key: string; elections: ElectionResponse[] } | null>(null);

  useEffect(() => {
    if (!enabled || !type || cache.has(key)) return;
    const controller = new AbortController();
    void fetchAllElections(countryId, {
      signal: controller.signal,
      status: ["completed", "resolved"],
      type,
    }).then((result) => {
      if (result.aborted) return;
      // A failed read is not cached, so reopening Finished retries it.
      if (!result.error) cache.set(key, result.elections);
      setLoaded({ key, elections: result.elections });
    });
    return () => controller.abort();
  }, [countryId, type, enabled, key]);

  const elections = cache.get(key) ?? (loaded?.key === key ? loaded.elections : null);
  const races = useMemo(
    () =>
      buildRaceIndex(elections ?? [], {
        currentTurn: null,
        nationalChamberKeys,
        includeFinal: true,
      }).filter((r) => r.stage === "final"),
    [elections, nationalChamberKeys]
  );
  return { races, loading: enabled && elections === null };
}
