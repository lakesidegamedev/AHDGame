/**
 * Geometry and timing for the broadcast lander's moving parts: satellites on
 * tilted orbits around the globe, and the uplinks they beam down to datelines.
 *
 * Pure: angles, positions and clocks in, numbers out. The globe owns rotation
 * and supplies it as a function, so nothing here depends on d3 or the DOM.
 */

/** A screen point in globe SVG units, and whether it is on the visible face. */
export type ScreenPoint = { x: number; y: number; visible: boolean };

/** The globe's rotation as d3 applies it: `[lon, lat]` in, rotated `[lon, lat]` out. */
export type Rotate = (lonLat: [number, number]) => [number, number];

const DEG = Math.PI / 180;

/** Orthographic projection of a place on the surface, as the globe draws it. */
export function projectOnGlobe(
  rotate: Rotate,
  lonLat: readonly [number, number],
  center: readonly [number, number],
  radius: number
): ScreenPoint {
  const [lon, lat] = rotate([lonLat[0], lonLat[1]]);
  const l = lon * DEG;
  const p = lat * DEG;
  return {
    x: center[0] + radius * Math.cos(p) * Math.sin(l),
    y: center[1] - radius * Math.sin(p),
    visible: Math.cos(p) * Math.cos(l) >= 0,
  };
}

export type OrbitSpec = {
  id: string;
  /** Orbit radius as a multiple of the globe radius. */
  radius: number;
  /** Tilt away from face-on, in degrees. 90 is edge-on. */
  tilt: number;
  /** Roll of the orbit in the screen plane, in degrees clockwise. */
  roll: number;
  /** Seconds per revolution. */
  period: number;
  /** Where in its revolution the satellite starts, 0 to 1. */
  phase: number;
};

/** Semi-axes of an orbit's on-screen ellipse at zoom 1. */
export function orbitAxes(orbit: OrbitSpec, globeRadius: number): { a: number; b: number } {
  const a = orbit.radius * globeRadius;
  return { a, b: a * Math.cos(orbit.tilt * DEG) };
}

/**
 * Where the satellite is at `seconds`, in the orbit's own frame (centred on
 * the globe, before `roll`). Uniform motion on a tilted circle, so it speeds
 * up across the face of the globe the way a real pass does. `near` is the half
 * that faces the viewer, the lower half of the ellipse.
 */
export function orbitPosition(
  orbit: OrbitSpec,
  globeRadius: number,
  seconds: number
): { x: number; y: number; theta: number; near: boolean } {
  const { a, b } = orbitAxes(orbit, globeRadius);
  const theta = 2 * Math.PI * (seconds / orbit.period + orbit.phase);
  const y = -b * Math.sin(theta);
  return { x: a * Math.cos(theta), y, theta, near: y > 0 };
}

/** The orbit-frame polyline from `theta - sweep` up to `theta`, for a trail. */
export function orbitTrail(
  orbit: OrbitSpec,
  globeRadius: number,
  theta: number,
  sweep: number,
  steps = 10
): [number, number][] {
  const { a, b } = orbitAxes(orbit, globeRadius);
  const out: [number, number][] = [];
  for (let i = steps; i >= 0; i--) {
    const at = theta - (sweep * i) / steps;
    out.push([a * Math.cos(at), -b * Math.sin(at)]);
  }
  return out;
}

/** An orbit-frame point carried into globe SVG coordinates. */
export function orbitToGlobe(
  [x, y]: readonly [number, number],
  orbit: OrbitSpec,
  center: readonly [number, number],
  zoom: number
): [number, number] {
  const r = orbit.roll * DEG;
  return [
    center[0] + zoom * (x * Math.cos(r) - y * Math.sin(r)),
    center[1] + zoom * (x * Math.sin(r) + y * Math.cos(r)),
  ];
}

/**
 * The uplink rota: a beam is live for `active` seconds, then the sky is quiet
 * for `rest`. Returns which beam this is (counting from zero) and how far
 * through it we are, or null between beams.
 */
export function beamAt(
  seconds: number,
  active: number,
  rest: number
): { beam: number; progress: number } | null {
  if (seconds < 0) return null;
  const cycle = active + rest;
  const beam = Math.floor(seconds / cycle);
  const into = seconds - beam * cycle;
  return into < active ? { beam, progress: into / active } : null;
}

/** Fade in over the first `edge` of a span and out over the last. */
export function envelope(progress: number, edge: number): number {
  return Math.max(0, Math.min(1, progress / edge, (1 - progress) / edge));
}

/* Nightside globe: sunlight, city lights and lifted routes. */

/** A world direction as a unit vector, x toward 0°E on the equator, z to the north pole. */
export type Vec3 = readonly [number, number, number];

export function lonLatToVec(lonLat: readonly [number, number]): Vec3 {
  const lon = lonLat[0] * DEG;
  const lat = lonLat[1] * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/**
 * Where the sun is overhead at `utcMs`, as `[lon, lat]`. The low-precision
 * almanac formula: good to a fraction of a degree, which is a pixel or two on
 * the landing globe.
 */
export function subsolarPoint(utcMs: number): [number, number] {
  const days = utcMs / 86_400_000 - 10_957.5;
  const meanLon = (280.46 + 0.9856474 * days) % 360;
  const anomaly = ((357.528 + 0.9856003 * days) % 360) * DEG;
  const eclipticLon = (meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * DEG;
  const obliquity = (23.439 - 0.0000004 * days) * DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLon),
    Math.cos(eclipticLon)
  );
  // Greenwich sidereal angle, then the sun's hour angle at Greenwich.
  const sidereal = (280.46061837 + 360.98564736629 * days) * DEG;
  const lon = (((((rightAscension - sidereal) / DEG + 180) % 360) + 360) % 360) - 180;
  return [lon, declination / DEG];
}

/**
 * The globe's rotation as a matrix on world unit vectors: `[screenX, screenUp,
 * depth]`, depth positive on the visible face. Built the same way the globe's
 * fast paths build theirs, from three rotated basis directions.
 */
export function viewBasis(rotate: Rotate): (v: Vec3) => [number, number, number] {
  const [ax, ay, az] = lonLatToVec(rotate([0, 0]));
  const [bx, by, bz] = lonLatToVec(rotate([90, 0]));
  const [cx, cy, cz] = lonLatToVec(rotate([0, 90]));
  return ([x, y, z]) => [
    ay * x + by * y + cy * z,
    az * x + bz * y + cz * z,
    ax * x + bx * y + cx * z,
  ];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Points along the great circle from `from` to `to`, both ends included. */
export function greatCircle(
  from: readonly [number, number],
  to: readonly [number, number],
  steps: number
): Vec3[] {
  const a = lonLatToVec(from);
  const b = lonLatToVec(to);
  const theta = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  const sin = Math.sin(theta) || 1;
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = theta === 0 ? 1 - t : Math.sin((1 - t) * theta) / sin;
    const q = theta === 0 ? t : Math.sin(t * theta) / sin;
    out.push([p * a[0] + q * b[0], p * a[1] + q * b[1], p * a[2] + q * b[2]]);
  }
  return out;
}

/**
 * A route flown above the surface: the great circle lifted by `lift` of the
 * radius at its middle, so long routes arc higher. A point is hidden only
 * where the sphere is between it and the viewer, so an arc rising off the far
 * side shows over the limb the way a real one would.
 */
export function liftedRoutePath(
  project: (v: Vec3) => [number, number, number],
  points: readonly Vec3[],
  center: readonly [number, number],
  radius: number,
  lift: number
): string {
  let d = "";
  let drawing = false;
  const last = points.length - 1;
  for (let i = 0; i <= last; i++) {
    const h = 1 + lift * Math.sin((Math.PI * i) / last);
    const [x, y, depth] = project(points[i]);
    const hidden = depth < 0 && Math.hypot(x, y) * h < 1;
    if (hidden) {
      drawing = false;
      continue;
    }
    d += `${drawing ? "L" : "M"}${r1(center[0] + radius * h * x)} ${r1(center[1] - radius * h * y)}`;
    drawing = true;
  }
  return d;
}

/** A light on the night side: `[lon, lat, weight]`, weight 1 to 3. */
export type CityLight = readonly [number, number, number];

/**
 * City lights for one frame, as two dot paths: the glow (every lit city) and
 * the bright cores (the big ones). A city lights up once the sun is a few
 * degrees under its horizon, and only on the visible face.
 */
export function cityLightPaths(
  project: (v: Vec3) => [number, number, number],
  sun: Vec3,
  lights: readonly CityLight[],
  center: readonly [number, number],
  radius: number
): { glow: string; core: string } {
  let glow = "";
  let core = "";
  for (const [lon, lat, weight] of lights) {
    const v = lonLatToVec([lon, lat]);
    const sunUp = v[0] * sun[0] + v[1] * sun[1] + v[2] * sun[2];
    if (sunUp > -0.06) continue;
    const [x, y, depth] = project(v);
    // Too close to the limb, a dot reads as noise on the rim.
    if (depth < 0.12) continue;
    const dot = `M${r1(center[0] + radius * x)} ${r1(center[1] - radius * y)}h0.01`;
    glow += dot;
    if (weight >= 2) core += dot;
  }
  return { glow, core };
}

/**
 * The visible part of the cap of angular radius `capRadius` around `pole`,
 * as one closed path on the globe's disc. Used for the night side: the cap
 * around the point opposite the sun. Analytic, so it costs a few dozen
 * points a frame rather than a clipped d3 polygon.
 */
export function capPath(
  project: (v: Vec3) => [number, number, number],
  pole: Vec3,
  capRadius: number,
  center: readonly [number, number],
  radius: number,
  samples = 72
): string {
  const cosR = Math.cos(capRadius);
  const sinR = Math.sin(capRadius);
  // Two directions at right angles to the pole.
  const helper: Vec3 = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(pole, helper));
  const w = cross(pole, u);
  const ring: [number, number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const phi = (2 * Math.PI * i) / samples;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    ring.push(
      project([
        cosR * pole[0] + sinR * (u[0] * c + w[0] * s),
        cosR * pole[1] + sinR * (u[1] * c + w[1] * s),
        cosR * pole[2] + sinR * (u[2] * c + w[2] * s),
      ])
    );
  }
  const [px, py, pd] = project(pole);
  const sx = (x: number) => r1(center[0] + radius * x);
  const sy = (y: number) => r1(center[1] - radius * y);
  // Is a limb direction inside the cap? On the limb depth is 0, so only the
  // pole's screen components count.
  const limbInside = (angle: number) => Math.cos(angle) * px + Math.sin(angle) * py > cosR;
  const limbCircle = `M${sx(1)} ${sy(0)}A${radius} ${radius} 0 1 0 ${sx(-1)} ${sy(0)}A${radius} ${radius} 0 1 0 ${sx(1)} ${sy(0)}Z`;

  const visible = ring.map((p) => p[2] >= 0);
  const anyVisible = visible.some(Boolean);
  if (!anyVisible) {
    // The boundary is wholly behind: the disc is all cap or none of it.
    return pd > cosR ? limbCircle : "";
  }
  if (visible.every(Boolean)) {
    const loop = ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x)} ${sy(y)}`).join("") + "Z";
    // A cap bigger than a hemisphere with its edge all in front covers the
    // disc outside that edge: draw both and let even-odd cut the hole.
    return cosR > 0 ? loop : `${limbCircle}${loop}`;
  }

  // One run of the boundary is in front. Start it where it comes over the horizon.
  let start = 0;
  while (!(visible[start] && !visible[(start - 1 + samples) % samples])) start++;
  const horizon = (a: [number, number, number], b: [number, number, number]) => {
    const t = a[2] / (a[2] - b[2]);
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const length = Math.hypot(x, y) || 1;
    return [x / length, y / length] as const;
  };
  const entry = horizon(ring[(start - 1 + samples) % samples], ring[start]);
  let d = `M${sx(entry[0])} ${sy(entry[1])}`;
  let i = start;
  while (visible[i % samples]) {
    const [x, y] = ring[i % samples];
    d += `L${sx(x)} ${sy(y)}`;
    i++;
  }
  const exit = horizon(ring[(i - 1) % samples], ring[i % samples]);
  d += `L${sx(exit[0])} ${sy(exit[1])}`;
  // Back to the entry along whichever half of the limb lies in the cap.
  const a0 = Math.atan2(exit[1], exit[0]);
  let a1 = Math.atan2(entry[1], entry[0]);
  if (a1 <= a0) a1 += 2 * Math.PI;
  const ccwInside = limbInside((a0 + a1) / 2);
  const steps = 24;
  for (let k = 1; k <= steps; k++) {
    const angle = ccwInside
      ? a0 + ((a1 - a0) * k) / steps
      : a0 - ((2 * Math.PI - (a1 - a0)) * k) / steps;
    d += `L${sx(Math.cos(angle))} ${sy(Math.sin(angle))}`;
  }
  return `${d}Z`;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
