"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cachedCounties,
  countyKey,
  loadCounties,
  type CountySource,
} from "@/app/elections/[id]/blend/presMap/countyStore";
import type { CountyApiResponse } from "@/app/elections/[id]/blend/presMap/countyModel";

export interface RegionUnitRequest {
  regionId: string;
  electionId: string;
  source: CountySource;
}

export type RegionUnitsResponse = CountyApiResponse & {
  unitLabel?: string;
  unitLabelPlural?: string;
};

/**
 * Sub-unit results for each requested region, through the presidential map's
 * shared store: one request per race, source and region for the page's life,
 * so zooming back to a region costs nothing. `version` (a turn) refetches.
 */
export function useRegionUnits(
  requests: RegionUnitRequest[],
  version: number
): Record<string, RegionUnitsResponse | null> {
  const [loaded, setLoaded] = useState(0);
  const sig = requests.map((r) => `${r.regionId}:${r.electionId}:${r.source.id}`).join(",");

  useEffect(() => {
    let live = true;
    for (const r of requests) {
      if (cachedCounties(countyKey(r.electionId, r.regionId, version, r.source.id))) continue;
      void loadCounties(r.electionId, r.regionId, version, r.source).then(() => {
        if (live) setLoaded((n) => n + 1);
      });
    }
    return () => {
      live = false;
    };
    // `sig` names the requests; a new array with the same members is the same request set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, version]);

  return useMemo(() => {
    void loaded;
    const out: Record<string, RegionUnitsResponse | null> = {};
    for (const r of requests) {
      out[r.regionId] =
        (cachedCounties(countyKey(r.electionId, r.regionId, version, r.source.id)) as
          RegionUnitsResponse | undefined) ?? null;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, version, loaded]);
}
