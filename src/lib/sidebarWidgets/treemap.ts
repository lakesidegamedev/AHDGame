/**
 * Tile layout for the sector heatmap: split the box in two by weight, along
 * its longer side, and recurse. Keeps tiles close to square without a full
 * squarified treemap. Coordinates are fractions of the box (0 to 1).
 */
export interface TreemapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function treemapLayout(weights: number[], aspect = 1): TreemapRect[] {
  const out: TreemapRect[] = new Array(weights.length);
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const split = (indexes: number[], rect: TreemapRect) => {
    if (indexes.length === 0) return;
    if (indexes.length === 1) {
      out[indexes[0]!] = rect;
      return;
    }
    const total = indexes.reduce((sum, i) => sum + safe[i]!, 0);
    // Cut where the running weight passes half, keeping both sides non-empty.
    let cut = 1;
    let running = safe[indexes[0]!]!;
    while (cut < indexes.length - 1 && running + safe[indexes[cut]!]! <= total / 2) {
      running += safe[indexes[cut]!]!;
      cut += 1;
    }
    const share = total > 0 ? running / total : cut / indexes.length;
    const wide = rect.w * aspect >= rect.h;
    const first = wide ? { ...rect, w: rect.w * share } : { ...rect, h: rect.h * share };
    const second = wide
      ? { ...rect, x: rect.x + first.w, w: rect.w - first.w }
      : { ...rect, y: rect.y + first.h, h: rect.h - first.h };
    split(indexes.slice(0, cut), first);
    split(indexes.slice(cut), second);
  };
  split(
    weights.map((_, i) => i),
    { x: 0, y: 0, w: 1, h: 1 }
  );
  return out;
}
