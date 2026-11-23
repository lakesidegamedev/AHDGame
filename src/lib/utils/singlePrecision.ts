/**
 * A number that went through single precision shows its binary dust when
 * printed (1.08 comes back as 1.0800000429153442). Values that are exactly
 * representable in single precision are snapped to their 7 significant digit
 * decimal form; any other value is returned untouched.
 */
export function settleSinglePrecision(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return value;
  const settled = Number(value.toPrecision(7));
  return Math.fround(settled) === value ? settled : value;
}
