/**
 * Playable-country markers on the landing globe. Positions are hand-set lon/lat
 * (not d3 centroids) so each chip sits on the recognizable heart of its nation:
 * USSR at Moscow (Russia's centroid is deep in Siberia) and East Germany near
 * Berlin (the modern basemap has no DDR feature — it shares unified Germany).
 */
export type LandingMarkerGeo = { label: string; lonLat: [number, number] };
export const LANDING_MARKERS: Record<string, LandingMarkerGeo> = {
  US: { label: "United States", lonLat: [-98, 39] },
  // Southern Ontario and Quebec, where most Canadians live, not the Arctic centroid.
  CA: { label: "Canada", lonLat: [-84, 50] },
  UK: { label: "United Kingdom", lonLat: [-1.8, 52.6] },
  RU: { label: "USSR", lonLat: [37.6, 55.75] },
  DD: { label: "East Germany", lonLat: [12.6, 52.2] },
  // Playable from 1991 on. Honshu, not the centroid, which sits in the sea.
  JP: { label: "Japan", lonLat: [138.6, 36.4] },
};
