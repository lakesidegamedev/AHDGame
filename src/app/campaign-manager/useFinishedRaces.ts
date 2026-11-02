"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAllElections } from "@/lib/elections/fetchAllElections";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import { buildRaceIndex, type CmRace } from "@/lib/campaignManager/rules";

/**
 * One read per country, race type and turn: finished races only change when a
 * turn resolves more of them, so `version` (the turn) is part of the key.
 */
const cache = new Map<string, ElectionResponse[]>();

/**
 * Every finished race of one type in the player's country, as `final` rows.
 * Loaded only while `enabled` (the Finished stage, which opening a past race
 * or a link to one switches to). While a new turn's list loads, the previous
 * turn's stays on screen, so the selection does not jump.
 */
export function useFinishedRaces(
  countryId: string,
  type: string,
  enabled: boolean,
  nationalChamberKeys: readonly string[],
  version: number
): { races: CmRace[]; loading: boolean } {
  const base = `${countryId}|${type}`;
  const key = `${base}|${version}`;
  const [loaded, setLoaded] = useState<{ base: string; elections: ElectionResponse[] } | null>(
    null
  );

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
      setLoaded({ base, elections: result.elections });
    });
    return () => controller.abort();
  }, [countryId, type, enabled, key, base]);

  const elections = cache.get(key) ?? (loaded?.base === base ? loaded.elections : null);
  const races = useMemo(
    () =>
      enabled
        ? buildRaceIndex(elections ?? [], {
            currentTurn: null,
            nationalChamberKeys,
            includeFinal: true,
          }).filter((r) => r.stage === "final")
        : [],
    [enabled, elections, nationalChamberKeys]
  );
  return { races, loading: enabled && elections === null };
}

const counts = new Map<string, number>();

/**
 * How many finished races of a type the country has, for the Finished stage's
 * count, without loading them: the list endpoint's total over a one-row page.
 */
export function useFinishedCount(countryId: string, type: string, version: number): number | null {
  const key = `${countryId}|${type}|${version}`;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!type || counts.has(key)) return;
    const controller = new AbortController();
    fetchJson<{ total?: number }>(
      `/api/elections?country=${countryId}&view=summary&limit=1&page=1&status=completed,resolved&type=${encodeURIComponent(type)}`,
      { signal: controller.signal, feature: "campaign-manager-finished-count" }
    )
      .then((data) => {
        counts.set(key, typeof data.total === "number" ? data.total : 0);
        setTick((n) => n + 1);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.warn("Campaign Manager: finished count", err);
      });
    return () => controller.abort();
  }, [countryId, type, key]);

  return counts.get(key) ?? null;
}
