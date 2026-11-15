/** Where the sun is overhead, from the real UTC time. Good to about a degree. */

export type LonLat = readonly [number, number];

const DAY_MS = 86_400_000;

/** Subsolar point (longitude, latitude in degrees) at `date`. */
export function subsolarPoint(date: Date): [number, number] {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - yearStart) / DAY_MS;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const b = ((2 * Math.PI) / 364) * (dayOfYear - 81);
  const equationOfTimeMin = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (utcHours - 12 + equationOfTimeMin / 60);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [lon, declination];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How lit a point is: 1 in full day, 0 in full night, with one soft twilight
 * band between. `cosZenith` is the dot product of the surface normal and the
 * direction to the sun.
 */
export const TWILIGHT_START = -0.34;
export const TWILIGHT_END = 0.1;
export function daylight(cosZenith: number): number {
  return smoothstep(TWILIGHT_START, TWILIGHT_END, cosZenith);
}
