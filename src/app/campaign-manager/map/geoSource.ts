import {
  COUNTY_OFFSET_Y,
  MAP_HEIGHT,
  MAP_WIDTH,
  loadUsStateGeo,
} from "@/app/elections/[id]/blend/presMap/usStatesGeo";
import { fetchJson } from "@/lib/observability/fetchJson";

/** [x0, y0, x1, y1] in map units. */
export type Box = [number, number, number, number];

export interface CampaignGeoRegion {
  n: string;
  d: string;
  bb: Box;
  /** Regions whose boxes touch this one: drawn a little stronger around it. */
  nb: string[];
}

/**
 * A country's map in one projected frame. Sub-unit shapes either ship with
 * the asset (`static`, UK and JP) or come with each region's results, already
 * in this frame after `unitOffsetY` (`results`, the US counties).
 */
export interface CampaignGeo {
  w: number;
  h: number;
  regions: Record<string, CampaignGeoRegion>;
  units: Record<string, Array<{ id: string; n: string; d: string }>> | null;
  unitSource: "static" | "results";
  unitOffsetY: number;
  /** The framed inset outline (Japan's southern islands). */
  frame?: string;
  /** Smallest region box (width, height) that gets a label on the national map. */
  labelMin?: [number, number];
}

const NEIGHBOUR_SLACK = 3;

export function boxesTouch(a: Box, b: Box, slack = NEIGHBOUR_SLACK): boolean {
  return (
    a[0] - slack <= b[2] && b[0] - slack <= a[2] && a[1] - slack <= b[3] && b[1] - slack <= a[3]
  );
}

async function loadUs(): Promise<CampaignGeo> {
  const states = await loadUsStateGeo();
  const regions: Record<string, CampaignGeoRegion> = {};
  for (const s of states) {
    regions[s.id] = { n: s.id, d: s.d, bb: [s.x0, s.y0, s.x0 + s.width, s.y0 + s.height], nb: [] };
  }
  for (const [id, r] of Object.entries(regions)) {
    r.nb = Object.keys(regions).filter(
      (other) => other !== id && boxesTouch(r.bb, regions[other].bb)
    );
  }
  return {
    w: MAP_WIDTH,
    h: MAP_HEIGHT,
    regions,
    units: null,
    unitSource: "results",
    unitOffsetY: COUNTY_OFFSET_Y,
    // Fifty states at national scale: the small eastern ones go unlabelled.
    labelMin: [34, 22],
  };
}

async function loadStatic(url: string, countryId: string): Promise<CampaignGeo | null> {
  try {
    const g = await fetchJson<Omit<CampaignGeo, "unitSource" | "unitOffsetY">>(url, {
      feature: "campaign-manager-geo",
    });
    return { ...g, unitSource: "static", unitOffsetY: 0 };
  } catch (err) {
    console.warn(`Campaign Manager: ${countryId} map unavailable`, err);
    return null;
  }
}

/** Countries with a Campaign Manager map, and how each one's map loads. */
const LOADERS: Record<string, () => Promise<CampaignGeo | null>> = {
  US: () =>
    loadUs().catch((err: unknown) => {
      console.warn("Campaign Manager: US map unavailable", err);
      return null;
    }),
  UK: () => loadStatic("/geo/campaign-manager/uk.json", "UK"),
  JP: () => loadStatic("/geo/campaign-manager/jp.json", "JP"),
};

const cache = new Map<string, Promise<CampaignGeo | null>>();

/**
 * The Campaign Manager map for a country, or null when it has none (or its
 * geometry failed to load; a failure is not cached, so the next visit retries).
 */
export function loadCampaignGeo(countryId: string): Promise<CampaignGeo | null> {
  const hit = cache.get(countryId);
  if (hit) return hit;
  const loader = LOADERS[countryId];
  if (!loader) return Promise.resolve(null);
  const load = loader();
  cache.set(countryId, load);
  void load.then((g) => {
    if (!g) cache.delete(countryId);
  });
  return load;
}
