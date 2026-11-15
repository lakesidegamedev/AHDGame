// src/components/landing/globeEnhancements.ts
/** Shapes the world map's optional overlay layers accept. */

export type ArcSpec = { id: string; from: [number, number]; to: [number, number]; color: string };
export type HotspotSpec = { id: string; lonLat: [number, number]; label: string };
export type StarSpec = {
  id: string;
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  /** Seconds to offset the shared twinkle animation, so stars shimmer out of phase. */
  twinkleDelay: number;
};
