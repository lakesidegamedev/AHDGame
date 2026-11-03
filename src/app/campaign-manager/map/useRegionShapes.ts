"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/observability/fetchJson";

export interface RegionShapes {
  unitLabel: string;
  unitLabelPlural: string;
  subdivisions: Array<{ id: string; name: string; path: string }>;
}

// Geometry never changes within a world, so one read per country, race type
// and region serves the page's whole life. A failure is not cached.
const shapes = new Map<string, RegionShapes>();
const inflight = new Map<string, Promise<RegionShapes | null>>();

function loadShapes(
  countryId: string,
  type: string,
  regionId: string
): Promise<RegionShapes | null> {
  const key = `${countryId}|${type}|${regionId}`;
  const hit = shapes.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetchJson<RegionShapes>(
    `/api/maps/subdivisions?country=${countryId}&type=${encodeURIComponent(type)}&region=${regionId}`,
    { feature: "campaign-manager-shapes" }
  )
    .then((data) => {
      shapes.set(key, data);
      return data;
    })
    .catch((err: unknown) => {
      console.warn(`Campaign Manager: no shapes for ${regionId}`, err);
      return null;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/**
 * Sub-unit shapes for the regions in view, for maps whose sub-units are not
 * part of the static asset (US counties and districts). Drawn whether or not
 * the race has results yet; results only colour them.
 */
export function useRegionShapes(
  countryId: string,
  type: string,
  regionIds: string[],
  enabled: boolean
): Record<string, RegionShapes | null> {
  const [loaded, setLoaded] = useState(0);
  const sig = regionIds.join(",");

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    for (const id of sig ? sig.split(",") : []) {
      if (shapes.has(`${countryId}|${type}|${id}`)) continue;
      void loadShapes(countryId, type, id).then(() => {
        if (live) setLoaded((n) => n + 1);
      });
    }
    return () => {
      live = false;
    };
  }, [countryId, type, sig, enabled]);

  return useMemo(() => {
    void loaded;
    const out: Record<string, RegionShapes | null> = {};
    if (!enabled) return out;
    for (const id of sig ? sig.split(",") : [])
      out[id] = shapes.get(`${countryId}|${type}|${id}`) ?? null;
    return out;
  }, [countryId, type, sig, enabled, loaded]);
}
