import { SERIES_ORDER, type SeriesTone } from "./seriesColours";

/**
 * One series colour per sector type, so a type keeps its colour across the
 * revenue strip, swatches and rankings. The corporation's primary type takes
 * the first colour; the rest follow in order of first appearance. Past six
 * types the palette repeats.
 */
export function sectorTypeTones(
  types: string[],
  primaryType?: string | null
): Record<string, SeriesTone> {
  const ordered: string[] = [];
  for (const type of primaryType ? [primaryType, ...types] : types) {
    if (!ordered.includes(type)) ordered.push(type);
  }
  return Object.fromEntries(
    ordered.map((type, i) => [type, SERIES_ORDER[i % SERIES_ORDER.length]])
  );
}
