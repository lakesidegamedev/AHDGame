// Shared polygon processing for offline country-map builders.
// Simplify absolute topology arcs with junction endpoints pinned.
export const simplifyArc = (arc, minTriangleArea) => {
  if (arc.length <= 2) return arc;
  const pts = arc.slice();
  const triArea = (a, b, c) =>
    Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  let changed = true;
  while (changed && pts.length > 2) {
    changed = false;
    let minArea = Infinity;
    let minI = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = triArea(pts[i - 1], pts[i], pts[i + 1]);
      if (a < minArea) {
        minArea = a;
        minI = i;
      }
    }
    if (minArea < minTriangleArea) {
      pts.splice(minI, 1);
      changed = true;
    }
  }
  return pts;
};

// Positive signed area means clockwise in longitude/latitude coordinates.
const windSignedArea = (r) => {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += (r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]);
  return s;
};
export const rewind = (geometry) => {
  const fixRing = (ring, wantCW) => {
    const a = windSignedArea(ring);
    if (a === 0) return ring;
    return a > 0 === wantCW ? ring : ring.slice().reverse();
  };
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const fixed = polys.map((poly) => poly.map((ring, i) => fixRing(ring, i === 0)));
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: fixed[0] }
    : { type: "MultiPolygon", coordinates: fixed };
};

export const roundGeometry = (geometry, round) => {
  const roundRing = (r) => r.map(([x, y]) => [round(x), round(y)]);
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const rounded = polys.map((poly) => poly.map(roundRing));
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: rounded[0] }
    : { type: "MultiPolygon", coordinates: rounded };
};
