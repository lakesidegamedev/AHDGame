/** Small numeric helpers shared by the economy chart modules. */

/** Evenly spaced values from `from` to `to` inclusive, rounded to kill float noise. */
export function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(round(from + i * step, 6));
  return out;
}

export function round(value: number, digits = 4): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}
