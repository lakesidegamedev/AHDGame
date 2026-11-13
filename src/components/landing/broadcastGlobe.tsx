/**
 * Globe art for the broadcast lander (the 1991 hero): a lit ocean sphere with
 * an atmosphere rim, a dissolved state's old outline as a fading dashed border
 * with the borders it left behind drawn in, and satellites on tilted orbits
 * that beam down to the datelines of the year's headlines.
 *
 * Renders inside `MapSVGContent` through its `underlay` / `overlay` slots and
 * is inert, so drag, hover and click still reach the countries underneath.
 * Static art is drawn once by React; moving pieces render on the globe's own
 * frame loop, which caps and halves frame rate on weak devices and stops when
 * the hero is scrolled away or the tab is hidden. Each moving piece is its own
 * element so a frame repaints a trail, not the whole globe.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MultiLineString } from "geojson";
import type { mesh as topojsonMesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { BroadcastPlace, BroadcastTickerItem, NightsideConfig } from "./eraThemes";
import { fetchJson } from "@/lib/observability/fetchJson";
import { NIGHT_CITIES } from "./nightCities";
import {
  beamAt,
  capPath,
  cityLightPaths,
  envelope,
  greatCircle,
  liftedRoutePath,
  lonLatToVec,
  subsolarPoint,
  viewBasis,
  type Vec3,
  orbitAxes,
  orbitPosition,
  orbitToGlobe,
  orbitTrail,
  projectOnGlobe,
  type OrbitSpec,
  type Rotate,
} from "./broadcastMotion";

/** Sphere and graticule colours handed to `MapSVGContent`. */
export const BROADCAST_SPHERE_FILL = "url(#ahd-bc-ocean)";
export const BROADCAST_SPHERE_STROKE = "rgba(150, 205, 255, 0.6)";
export const BROADCAST_GRATICULE_STROKE = "rgba(190, 220, 255, 0.45)";

/** The nightside globe's sphere: a darker sea, so city lights and routes carry the frame. */
export const NIGHTSIDE_SPHERE_FILL = "url(#ahd-bc-ocean-night)";
export const NIGHTSIDE_SPHERE_STROKE = "rgba(120, 220, 255, 0.55)";
export const NIGHTSIDE_GRATICULE_STROKE = "rgba(140, 210, 255, 0.28)";

/** Sphere, rim and graticule colours for either broadcast look. */
export function broadcastSphereStyle(nightside: boolean): {
  fill: string;
  stroke: string;
  graticule: string;
} {
  return nightside
    ? {
        fill: NIGHTSIDE_SPHERE_FILL,
        stroke: NIGHTSIDE_SPHERE_STROKE,
        graticule: NIGHTSIDE_GRATICULE_STROKE,
      }
    : {
        fill: BROADCAST_SPHERE_FILL,
        stroke: BROADCAST_SPHERE_STROKE,
        graticule: BROADCAST_GRATICULE_STROKE,
      };
}

/** Night colour, warm city light and the cyan the routes and region carry. */
const NIGHT_FILL = "#01040d";
const LIGHT_GLOW = "#ffb547";
const LIGHT_CORE = "#fff3d1";
const ROUTE_CYAN = "#5fe3ff";

/**
 * Bands of the night side, around the point opposite the sun, as angular
 * radius in degrees and opacity. The widest reaches past the terminator for
 * twilight; stacked, they darken toward deep night without a blur filter.
 */
const NIGHT_BANDS: readonly (readonly [number, number])[] = [
  [97, 0.2],
  [91, 0.3],
  [84, 0.26],
  [74, 0.22],
];

/** Lift of a route's midpoint above the surface, as a share of the radius per radian flown. */
const ROUTE_LIFT_PER_RADIAN = 0.075;
const ROUTE_SAMPLES = 32;
/** Seconds for a packet to cross a route. Staggered so they never pulse in step. */
const PACKET_PERIOD_S = 5.5;

const SIGNAL_RED = "#ff4d5e";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Orbit = OrbitSpec & { dotted: boolean };

/**
 * Two rings that cross in front of the globe on opposite halves: the inner on
 * the lower half, the outer (rolled past 180°) on the upper. Between them a
 * satellite is near every part of the face, so no uplink has to cross it.
 */
const ORBITS: readonly Orbit[] = [
  { id: "inner", radius: 1.12, tilt: 73, roll: -15, period: 34, phase: 0, dotted: false },
  { id: "outer", radius: 1.36, tilt: 81, roll: 191, period: 78, phase: 0, dotted: true },
];

type Satellite = {
  id: string;
  orbit: Orbit;
  /** Where in its revolution it starts, 0 to 1. */
  phase: number;
  /** Carries the era's orbit label. */
  labelled: boolean;
  /** A constellation craft: a bare dot with no trail and no beam. */
  small?: boolean;
};

/**
 * Mir on the inner ring, and three comsats a third of a turn apart on the
 * outer: one of them is always on the near side, so a beam always has a source.
 */
const SATELLITES: readonly Satellite[] = [
  { id: "mir", orbit: ORBITS[0], phase: 0.7, labelled: true },
  { id: "comsat-1", orbit: ORBITS[1], phase: 0.25, labelled: false },
  { id: "comsat-2", orbit: ORBITS[1], phase: 0.25 + 1 / 3, labelled: false },
  { id: "comsat-3", orbit: ORBITS[1], phase: 0.25 + 2 / 3, labelled: false },
];

/**
 * The nightside sky adds a low, busy shell: a broadband constellation of
 * small craft close over the surface, no trails, so the sky reads as 2027 and
 * not 1991 without costing a trail path each.
 */
const CONSTELLATION_ORBIT: Orbit = {
  id: "leo",
  radius: 1.055,
  tilt: 66,
  roll: 24,
  period: 26,
  phase: 0,
  dotted: true,
};
const CONSTELLATION_SIZE = 9;
const NIGHT_ORBITS: readonly Orbit[] = [...ORBITS, CONSTELLATION_ORBIT];
const NIGHT_SATELLITES: readonly Satellite[] = [
  ...SATELLITES,
  ...Array.from({ length: CONSTELLATION_SIZE }, (_, i) => ({
    id: `leo-${i}`,
    orbit: CONSTELLATION_ORBIT,
    phase: i / CONSTELLATION_SIZE,
    labelled: false,
    small: true,
  })),
];

const orbitsFor = (nightside: boolean) => (nightside ? NIGHT_ORBITS : ORBITS);
const satellitesFor = (nightside: boolean) => (nightside ? NIGHT_SATELLITES : SATELLITES);

/** Radians of orbit a satellite's trail covers. */
const TRAIL_SWEEP = 0.42;

/** One beam at a time: live for this long, then a short quiet spell. */
const BEAM_ACTIVE_S = 2.8;
const BEAM_REST_S = 0.9;

/** Places a beam may not revisit until this many others have had one. */
const BEAM_PLACE_COOLDOWN = 3;

/** The dissolved state's outline breathes once its CSS break has run. */
const GHOST_PULSE_DELAY_S = 3.2;
const GHOST_PULSE_PERIOD_S = 6;

/** A dateline nearer the limb than this share of the radius is too foreshortened to land on. */
const BEAM_MAX_INSET = 0.9;

function broadcastZoomTransform(translate: readonly [number, number], zoom: number): string {
  return `translate(${translate[0]} ${translate[1]}) scale(${zoom})`;
}

/** Precomputed meshes for a dissolved state. */
export type DissolvedStateGeometry = {
  /** Arcs on the outer edge of the union: the border that no longer exists. */
  outline: MultiLineString;
  /** Arcs shared by two members: the borders the break-up created. */
  seams: MultiLineString;
};

/**
 * A dissolved state as two meshes rather than its merged polygon: lines never
 * fill, so the land keeps its tier colour under them. An arc used once by the
 * members is on the union's edge; one used twice is a border between them.
 * `mesh` is `topojson-client`'s, passed in because the globe loads it lazily.
 */
export function dissolvedStateGeometry(
  mesh: typeof topojsonMesh,
  topology: Topology,
  featureIds: readonly string[]
): DissolvedStateGeometry | null {
  if (featureIds.length === 0) return null;
  const members = new Set(featureIds);
  const countries = topology.objects.countries as GeometryCollection;
  const union: GeometryCollection = {
    type: "GeometryCollection",
    geometries: countries.geometries.filter((g) => members.has(String(g.id))),
  };
  if (union.geometries.length === 0) return null;
  return {
    outline: mesh(topology, union, (a, b) => a === b),
    seams: mesh(topology, union, (a, b) => a !== b),
  };
}

/** What the globe hands `render` each frame. */
export type BroadcastView = {
  rotate: Rotate;
  zoom: number;
  /** Milliseconds, on the same clock as `requestAnimationFrame`. */
  now: number;
  /** False under reduced motion: satellites park and no beam is drawn. */
  animate: boolean;
  /**
   * False while the globe's idle crisis tour has the stage: satellites keep
   * orbiting, but no beam competes with the tour's card. Defaults to true.
   */
  beams?: boolean;
  /**
   * Projects a line mesh for this frame, cut at the horizon. Present only when
   * the globe itself moved and its borders need redrawing.
   */
  lines?: (geometry: MultiLineString) => string;
};

type Dateline = { place: BroadcastPlace; date: string };

type BindRef = (key: string) => (el: SVGElement | null) => void;

/* ────────────────────────────────────────────────────────────────────────── */
/* Static art                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function OrbitSide({
  orbit,
  side,
  globeRadius,
  label,
  bind,
  satellites,
}: {
  orbit: Orbit;
  side: "far" | "near";
  globeRadius: number;
  label?: string;
  bind: BindRef;
  satellites: readonly Satellite[];
}) {
  const { a, b } = orbitAxes(orbit, globeRadius);
  const clipId = `ahd-bc-orbit-${orbit.id}-${side}`;
  const pad = 14;
  const near = side === "near";

  return (
    <g transform={`rotate(${orbit.roll})`}>
      <defs>
        {/* The far side is drawn under the sphere, the near side over it; each
            keeps to its own half so a satellite crossing the limb is drawn once. */}
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <rect x={-a - pad} y={near ? 0 : -b - pad} width={2 * (a + pad)} height={b + pad} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <ellipse
          rx={a}
          ry={b}
          fill="none"
          stroke="rgb(170, 210, 255)"
          strokeOpacity={near ? 0.3 : 0.14}
          strokeWidth={orbit.dotted ? 0.55 : 0.4}
          strokeDasharray={orbit.dotted ? "0.6 2.4" : undefined}
          strokeLinecap={orbit.dotted ? "round" : undefined}
        />
        {satellites
          .filter((sat) => sat.orbit === orbit && sat.small)
          .map((sat) => (
            <circle
              key={sat.id}
              ref={bind(`sat:${sat.id}:${side}`)}
              r={0.55}
              fill="#e6fbff"
              opacity={near ? 0.9 : 0.45}
            />
          ))}
        {satellites
          .filter((sat) => sat.orbit === orbit && !sat.small)
          .map((sat) => (
            <g key={sat.id}>
              <path
                ref={bind(`trail:${sat.id}:${side}`)}
                fill="none"
                stroke={`url(#ahd-bc-trail-${sat.id})`}
                strokeWidth={0.85}
                strokeLinecap="round"
                opacity={near ? 1 : 0.6}
              />
              <g ref={bind(`sat:${sat.id}:${side}`)} opacity={near ? 1 : 0.65}>
                {/* Swells while this satellite is the one transmitting. */}
                <circle
                  ref={bind(`halo:${sat.id}:${side}`)}
                  r={2.6}
                  fill="#ffffff"
                  opacity={0.16}
                />
                <rect x={-3.4} y={-0.35} width={6.8} height={0.7} fill="rgb(200, 225, 255)" />
                <circle r={1.15} fill="#ffffff" />
                {sat.labelled && label && (
                  <text
                    x={4.2}
                    y={-3.2}
                    transform={`rotate(${-orbit.roll})`}
                    fill="#ffffff"
                    fillOpacity={0.85}
                    fontSize={4.4}
                    fontFamily={MONO}
                    letterSpacing={0.6}
                  >
                    {label}
                  </text>
                )}
              </g>
            </g>
          ))}
      </g>
    </g>
  );
}

/** Painted behind the sphere: gradients, the atmosphere rim, the far side of each orbit. */
export function BroadcastUnderlay({
  translate,
  globeRadius,
  zoom,
  bind,
  nightside = false,
}: {
  translate: readonly [number, number];
  globeRadius: number;
  /** Zoom at render time; the frame loop keeps it current between renders. */
  zoom: number;
  bind: BindRef;
  /** The present-day look: darker sea, cyan rim, the constellation shell. */
  nightside?: boolean;
}) {
  const atmosphere = globeRadius * (nightside ? 1.2 : 1.16);
  const limb = globeRadius / atmosphere;
  const rim = nightside
    ? (["#7fe9ff", "#8cefff", "#2fc4ff", "#1b8cff"] as const)
    : (["#7cc0ff", "#8ac8ff", "#4f9dff", "#2f7bff"] as const);

  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      <defs>
        <radialGradient id="ahd-bc-ocean" cx="40%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#3f86d6" />
          <stop offset="32%" stopColor="#1d58ab" />
          <stop offset="66%" stopColor="#0f3577" />
          <stop offset="100%" stopColor="#06173f" />
        </radialGradient>
        {nightside && (
          // Lit from the left of frame, where the day side opens.
          <radialGradient id="ahd-bc-ocean-night" cx="30%" cy="40%" r="80%">
            <stop offset="0%" stopColor="#1f5f9e" />
            <stop offset="34%" stopColor="#123f74" />
            <stop offset="70%" stopColor="#0a2448" />
            <stop offset="100%" stopColor="#040d22" />
          </radialGradient>
        )}
        <radialGradient id="ahd-bc-atmosphere" cx="50%" cy="50%" r="50%">
          <stop offset={limb - 0.02} stopColor={rim[0]} stopOpacity={0} />
          <stop offset={limb} stopColor={rim[1]} stopOpacity={nightside ? 0.5 : 0.55} />
          <stop offset={limb + 0.035} stopColor={rim[2]} stopOpacity={0.2} />
          <stop offset={limb + 0.08} stopColor={rim[3]} stopOpacity={0.06} />
          <stop offset="100%" stopColor={rim[3]} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="ahd-bc-shade" cx="34%" cy="28%" r="92%">
          <stop offset="0%" stopColor="#030714" stopOpacity={0} />
          <stop offset="46%" stopColor="#030714" stopOpacity={0} />
          <stop offset="76%" stopColor="#030714" stopOpacity={0.42} />
          <stop offset="100%" stopColor="#030714" stopOpacity={0.8} />
        </radialGradient>
        <radialGradient id="ahd-bc-sheen" cx="33%" cy="26%" r="40%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.17} />
          <stop offset="55%" stopColor="#ffffff" stopOpacity={0.05} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        {/* Trail gradients run tail to head; `render` moves their ends. Both
            sides of an orbit share one, as they share a coordinate frame. */}
        {satellitesFor(nightside)
          .filter((sat) => !sat.small)
          .map((sat) => (
            <linearGradient
              key={sat.id}
              id={`ahd-bc-trail-${sat.id}`}
              ref={bind(`grad:${sat.id}`)}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.75} />
            </linearGradient>
          ))}
      </defs>
      <g ref={bind("zoom:underlay")} transform={broadcastZoomTransform(translate, zoom)}>
        <circle r={atmosphere} fill="url(#ahd-bc-atmosphere)" />
        {orbitsFor(nightside).map((orbit) => (
          <OrbitSide
            key={orbit.id}
            orbit={orbit}
            side="far"
            globeRadius={globeRadius}
            bind={bind}
            satellites={satellitesFor(nightside)}
          />
        ))}
      </g>
    </g>
  );
}

/** One uplink: a cone of light from a satellite to a dateline, which pings and names itself. */
function UplinkBeam({ bind }: { bind: BindRef }) {
  return (
    <g ref={bind("beam")} opacity={0}>
      <defs>
        <linearGradient id="ahd-bc-beam" ref={bind("beam:grad")} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.04} />
        </linearGradient>
      </defs>
      <polygon ref={bind("beam:cone")} fill="url(#ahd-bc-beam)" />
      <line ref={bind("beam:axis")} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.3} />
      <g ref={bind("beam:ping")}>
        <circle ref={bind("beam:ring")} fill="none" stroke={SIGNAL_RED} strokeWidth={0.6} />
        <circle ref={bind("beam:ring2")} fill="none" stroke={SIGNAL_RED} strokeWidth={0.45} />
        <circle r={1.2} fill={SIGNAL_RED} />
        {/* Set like the crawl: place in white, date in red. Phones hide it: there
            the globe sits behind the headline and the label reads as noise. */}
        <text
          x={3.6}
          y={-3}
          fontSize={4.2}
          fontFamily={MONO}
          letterSpacing={0.5}
          className="max-sm:hidden"
        >
          <tspan ref={bind("beam:place")} fill="#ffffff" />
          <tspan ref={bind("beam:date")} dx={2.4} fill={SIGNAL_RED} />
        </text>
      </g>
    </g>
  );
}

/**
 * Painted over the countries: the day/night shading and sheen, the dissolved
 * state's borders on top of that so they stay legible on the night side, the
 * uplink, then the near side of each orbit.
 */
export function BroadcastOverlay({
  translate,
  globeRadius,
  zoom,
  bind,
  orbitLabel,
  nightside,
}: {
  translate: readonly [number, number];
  globeRadius: number;
  zoom: number;
  bind: BindRef;
  orbitLabel?: string;
  /** The present-day layers: night, city lights, routes and the watched region. */
  nightside?: NightsideConfig;
}) {
  const transform = broadcastZoomTransform(translate, zoom);
  const night = Boolean(nightside);

  return (
    <g aria-hidden="true" style={{ pointerEvents: "none" }}>
      {night ? (
        <>
          {/* `d` on every layer below is written by the frame loop. */}
          {NIGHT_BANDS.map(([, opacity], i) => (
            <path
              key={i}
              ref={bind(`night:${i}`)}
              fill={NIGHT_FILL}
              fillOpacity={opacity}
              fillRule="evenodd"
            />
          ))}
          <g ref={bind("zoom:shade")} transform={transform}>
            <circle r={globeRadius} fill="url(#ahd-bc-sheen)" opacity={0.6} />
          </g>
          <path
            ref={bind("lights:glow")}
            fill="none"
            stroke={LIGHT_GLOW}
            strokeOpacity={0.42}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path
            ref={bind("lights:core")}
            fill="none"
            stroke={LIGHT_CORE}
            strokeOpacity={1}
            strokeWidth={0.95}
            strokeLinecap="round"
          />
          <path
            ref={bind("region:outline")}
            fill={ROUTE_CYAN}
            fillOpacity={0.08}
            stroke={ROUTE_CYAN}
            strokeOpacity={0.9}
            strokeWidth={0.6}
            strokeDasharray="1.6 1.2"
            strokeLinejoin="round"
          />
          {nightside?.watchedRegion && (
            <text
              ref={bind("region:label")}
              fill="#ffffff"
              fillOpacity={0.9}
              fontSize={4}
              fontFamily={MONO}
              letterSpacing={0.6}
              textAnchor="middle"
              opacity={0}
              className="max-sm:hidden"
            >
              {nightside.watchedRegion.label.toUpperCase()}
            </text>
          )}
          {nightside?.routes.map((_, i) => (
            <g key={i}>
              <path
                ref={bind(`route:${i}`)}
                fill="none"
                stroke={ROUTE_CYAN}
                strokeOpacity={0.55}
                strokeWidth={0.55}
                strokeLinecap="round"
              />
              <path
                ref={bind(`packet:${i}`)}
                fill="none"
                stroke="#e9fdff"
                strokeOpacity={1}
                strokeWidth={1}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="7 93"
              />
            </g>
          ))}
        </>
      ) : (
        <g ref={bind("zoom:shade")} transform={transform}>
          <circle r={globeRadius} fill="url(#ahd-bc-shade)" />
          <circle r={globeRadius} fill="url(#ahd-bc-sheen)" />
        </g>
      )}
      {/* `d` is written by the frame loop and never by React. */}
      <path
        ref={bind("seams")}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.72}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <path
        ref={bind("outline")}
        className="ahd-bc-ghost"
        fill="none"
        stroke={SIGNAL_RED}
        strokeWidth={0.95}
        strokeLinejoin="round"
      />
      <UplinkBeam bind={bind} />
      <g ref={bind("zoom:orbits")} transform={transform}>
        {orbitsFor(night).map((orbit) => (
          <OrbitSide
            key={orbit.id}
            orbit={orbit}
            side="near"
            globeRadius={globeRadius}
            label={orbitLabel}
            bind={bind}
            satellites={satellitesFor(night)}
          />
        ))}
      </g>
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Frame writer                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

function setAttrs(el: SVGElement | null | undefined, attrs: Record<string, string | number>) {
  if (!el) return;
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
}

function setText(el: SVGElement | null | undefined, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

function pointsPath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join("");
}

const fixed = (n: number) => n.toFixed(2);

/**
 * Refs and the per-frame writer for the broadcast layers. The globe calls
 * `render` whenever it reprojects, and on its idle frames while held still, so
 * borders never lag the land they trace and satellites keep moving under a
 * hovering cursor.
 */
type NightsidePlan = {
  /** The sun's direction, and the pole of the night side opposite it. */
  sun: Vec3;
  antisolar: Vec3;
  routes: { points: Vec3[]; lift: number }[];
};

function planNightside(config: NightsideConfig): NightsidePlan {
  const sun = lonLatToVec(subsolarPoint(Date.parse(config.sunAt)));
  return {
    sun,
    antisolar: [-sun[0], -sun[1], -sun[2]],
    routes: config.routes.map(({ from, to }) => {
      const points = greatCircle(from.lonLat, to.lonLat, ROUTE_SAMPLES);
      const a = points[0];
      const b = points[points.length - 1];
      const flown = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
      return { points, lift: Math.min(0.2, Math.max(0.035, flown * ROUTE_LIFT_PER_RADIAN)) };
    }),
  };
}

/** A region's outer rings as unit vectors, from a GeoJSON Polygon or MultiPolygon. */
function regionRings(geometry: { type: string; coordinates: unknown }): Vec3[][] {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [];
  return polygons.map((polygon) => polygon[0].map(([lon, lat]) => lonLatToVec([lon, lat])));
}

export function useBroadcastGlobeLayers({
  translate,
  globeRadius,
  ticker,
  nightside,
}: {
  translate: readonly [number, number];
  globeRadius: number;
  /** The crawl. Every item with a place is a dateline a satellite can beam to. */
  ticker?: readonly BroadcastTickerItem[];
  /** The present-day layers. Pass a stable reference; the era config is one. */
  nightside?: NightsideConfig;
}) {
  const els = useRef(new Map<string, SVGElement>());
  const binders = useRef(new Map<string, (el: SVGElement | null) => void>());
  const geometry = useRef<DissolvedStateGeometry | null>(null);
  const lastZoom = useRef<number | null>(null);
  // A beam keeps its satellite and dateline from start to finish.
  const beamTarget = useRef<{ beam: number; satellite: string; dateline: number } | null>(null);
  const recentPlaces = useRef<string[]>([]);
  const lastBeamed = useRef(new Map<number, number>());

  const night = nightside !== undefined;
  const satellites = satellitesFor(night);
  const plan = useMemo(() => (nightside ? planNightside(nightside) : null), [nightside]);
  // The night layers only move when the globe does; this is the view they were drawn for.
  const nightView = useRef("");
  const region = useRef<Vec3[][] | null>(null);
  const watched = nightside?.watchedRegion;

  useEffect(() => {
    if (!watched) return;
    let cancelled = false;
    type RegionShard = {
      features?: {
        id?: unknown;
        properties?: Record<string, unknown>;
        geometry?: { type: string; coordinates: unknown };
      }[];
    };
    fetchJson<RegionShard>(watched.geoUrl, { feature: "landing-globe-region" })
      .then((collection) => {
        if (cancelled) return;
        const feature = collection.features?.find(
          (f) => f.properties?.regionCode === watched.featureId || f.id === watched.featureId
        );
        if (!feature?.geometry) return;
        region.current = regionRings(feature.geometry);
        nightView.current = "";
      })
      // fetchJson has already reported a real fault. The region is a flourish:
      // without it the globe is complete, so there is no error state to show.
      .catch((error: unknown) => {
        if (!cancelled) region.current = null;
        return error;
      });
    return () => {
      cancelled = true;
    };
  }, [watched]);

  const datelines = useMemo<readonly Dateline[]>(
    () =>
      (ticker ?? []).flatMap((item) =>
        item.place ? [{ place: item.place, date: item.date }] : []
      ),
    [ticker]
  );

  /** One stable callback ref per element key, so React never re-attaches them. */
  const bind = useCallback<BindRef>((key) => {
    let callback = binders.current.get(key);
    if (!callback) {
      callback = (el) => {
        if (el) els.current.set(key, el);
        else els.current.delete(key);
        // A new zoom group carries render-time zoom; rewrite it next frame.
        if (key.startsWith("zoom:")) lastZoom.current = null;
      };
      binders.current.set(key, callback);
    }
    return callback;
  }, []);

  const render = useCallback(
    (view: BroadcastView) => {
      const el = (key: string) => els.current.get(key);
      const seconds = view.now / 1000;
      const radius = globeRadius * view.zoom;

      // The old border breathes, here rather than in CSS so it repaints with
      // the frame instead of at 60fps on its own. Full strength while the
      // stylesheet breaks it into dashes, then a slow 6s swell.
      const breathing = view.animate ? Math.max(0, seconds - GHOST_PULSE_DELAY_S) : 0;
      el("outline")?.setAttribute(
        "opacity",
        fixed(0.65 + 0.25 * Math.cos((2 * Math.PI * breathing) / GHOST_PULSE_PERIOD_S))
      );

      // The dissolved state's borders only move when the globe does.
      const meshes = geometry.current;
      if (meshes && view.lines) {
        el("outline")?.setAttribute("d", view.lines(meshes.outline));
        el("seams")?.setAttribute("d", view.lines(meshes.seams));
      }

      if (lastZoom.current !== view.zoom) {
        lastZoom.current = view.zoom;
        const transform = broadcastZoomTransform(translate, view.zoom);
        for (const key of ["zoom:underlay", "zoom:shade", "zoom:orbits"]) {
          el(key)?.setAttribute("transform", transform);
        }
      }

      if (plan) {
        const project = viewBasis(view.rotate);
        const viewKey = `${project([1, 0, 0]).map(fixed).join()}|${project([0, 0, 1]).map(fixed).join()}|${view.zoom}`;
        if (viewKey !== nightView.current) {
          nightView.current = viewKey;
          NIGHT_BANDS.forEach(([degrees], i) => {
            el(`night:${i}`)?.setAttribute(
              "d",
              capPath(project, plan.antisolar, (degrees * Math.PI) / 180, translate, radius)
            );
          });
          const lights = cityLightPaths(project, plan.sun, NIGHT_CITIES, translate, radius);
          el("lights:glow")?.setAttribute("d", lights.glow);
          el("lights:core")?.setAttribute("d", lights.core);
          plan.routes.forEach((route, i) => {
            const d = liftedRoutePath(project, route.points, translate, radius, route.lift);
            el(`route:${i}`)?.setAttribute("d", d);
            el(`packet:${i}`)?.setAttribute("d", d);
          });
          const rings = region.current;
          if (rings && watched) {
            let d = "";
            let whole = true;
            for (const ring of rings) {
              let drawing = false;
              for (const v of ring) {
                const [x, y, depth] = project(v);
                if (depth < 0) {
                  whole = false;
                  drawing = false;
                  continue;
                }
                d += `${drawing ? "L" : "M"}${fixed(translate[0] + radius * x)} ${fixed(translate[1] - radius * y)}`;
                drawing = true;
              }
              if (whole) d += "Z";
            }
            setAttrs(el("region:outline"), { d, "fill-opacity": whole ? 0.08 : 0 });
            const [lx, ly, ldepth] = project(lonLatToVec(watched.labelLonLat));
            setAttrs(el("region:label"), {
              x: fixed(translate[0] + radius * lx),
              y: fixed(translate[1] - radius * ly),
              opacity: ldepth > 0.3 ? 1 : 0,
            });
          }
        }
        // Packets run along their routes; under reduced motion the routes stand still and bare.
        plan.routes.forEach((_, i) => {
          const packet = el(`packet:${i}`);
          if (!view.animate) {
            packet?.setAttribute("opacity", "0");
            return;
          }
          const travelled = (seconds / PACKET_PERIOD_S + i * 0.383) % 1;
          setAttrs(packet, { opacity: 1, "stroke-dashoffset": fixed(100 - travelled * 105) });
        });
      }

      // Satellites. Under reduced motion they hold their opening positions.
      const placed = satellites.map((sat) => {
        const orbit = { ...sat.orbit, phase: sat.phase };
        const position = orbitPosition(orbit, globeRadius, view.animate ? seconds : 0);
        if (sat.small) {
          for (const side of ["far", "near"]) {
            setAttrs(el(`sat:${sat.id}:${side}`), {
              transform: `translate(${fixed(position.x)} ${fixed(position.y)})`,
            });
          }
          return { id: sat.id, orbit, position, small: true };
        }
        const trail = orbitTrail(orbit, globeRadius, position.theta, TRAIL_SWEEP);
        const d = view.animate ? pointsPath(trail) : "";
        for (const side of ["far", "near"]) {
          setAttrs(el(`sat:${sat.id}:${side}`), {
            transform: `translate(${fixed(position.x)} ${fixed(position.y)})`,
          });
          el(`trail:${sat.id}:${side}`)?.setAttribute("d", d);
        }
        const [tailX, tailY] = trail[0];
        setAttrs(el(`grad:${sat.id}`), {
          x1: fixed(tailX),
          y1: fixed(tailY),
          x2: fixed(position.x),
          y2: fixed(position.y),
        });
        return { id: sat.id, orbit, position, small: false };
      });

      const beam = el("beam");
      const live =
        view.animate && view.beams !== false && datelines.length > 0
          ? beamAt(seconds, BEAM_ACTIVE_S, BEAM_REST_S)
          : null;
      const quiet = () => {
        setAttrs(beam, { opacity: 0 });
        for (const sat of SATELLITES) {
          for (const side of ["far", "near"]) {
            setAttrs(el(`halo:${sat.id}:${side}`), { r: 2.6, opacity: 0.16 });
          }
        }
      };
      if (!live) {
        quiet();
        return;
      }

      const project = (lonLat: readonly [number, number]) =>
        projectOnGlobe(view.rotate, lonLat, translate, radius);

      // At the start of each beam, pair a near-side satellite with the visible
      // dateline closest to the point directly beneath it, so the beam drops
      // rather than crossing the globe. A place that just had a beam sits out,
      // and a place with several datelines (Moscow) cycles through its dates.
      if (beamTarget.current?.beam !== live.beam) {
        type Pick = { satellite: string; dateline: number; distance: number; used: number };
        const pick = (cooldown: boolean): Pick | null => {
          let best: Pick | null = null;
          for (const { id, orbit, position, small } of placed) {
            if (small || !position.near) continue;
            const [px, py] = orbitToGlobe([position.x, position.y], orbit, translate, view.zoom);
            const nadirX = translate[0] + (px - translate[0]) / orbit.radius;
            const nadirY = translate[1] + (py - translate[1]) / orbit.radius;
            for (let index = 0; index < datelines.length; index++) {
              if (cooldown && recentPlaces.current.includes(datelines[index].place.name)) continue;
              const p = project(datelines[index].place.lonLat);
              const inset = Math.hypot(p.x - translate[0], p.y - translate[1]) / radius;
              if (!p.visible || inset > BEAM_MAX_INSET) continue;
              const distance = Math.hypot(p.x - nadirX, p.y - nadirY);
              const used = lastBeamed.current.get(index) ?? -1;
              if (
                !best ||
                distance < best.distance - 1e-6 ||
                (Math.abs(distance - best.distance) < 1e-6 && used < best.used)
              ) {
                best = { satellite: id, dateline: index, distance, used };
              }
            }
          }
          return best;
        };
        // With the globe held still, every visible place can be cooling down at
        // once; a repeat then beats a sky that never transmits again.
        const best = pick(true) ?? pick(false);
        beamTarget.current = {
          beam: live.beam,
          satellite: best?.satellite ?? "",
          dateline: best?.dateline ?? -1,
        };
        if (best) {
          lastBeamed.current.set(best.dateline, live.beam);
          recentPlaces.current = [
            datelines[best.dateline].place.name,
            ...recentPlaces.current,
          ].slice(0, BEAM_PLACE_COOLDOWN);
        }
      }

      const target = beamTarget.current;
      const dateline = target.dateline >= 0 ? datelines[target.dateline] : undefined;
      const ground = dateline ? project(dateline.place.lonLat) : undefined;
      const source = placed.find(({ id }) => id === target.satellite);
      if (!dateline || !ground?.visible || !source?.position.near) {
        quiet();
        return;
      }

      const [sx, sy] = orbitToGlobe(
        [source.position.x, source.position.y],
        source.orbit,
        translate,
        view.zoom
      );
      const fade = envelope(live.progress, 0.14);
      const dx = ground.x - sx;
      const dy = ground.y - sy;
      const length = Math.hypot(dx, dy) || 1;
      // Half-width of the cone where it meets the ground.
      const nx = (-dy / length) * 2.6;
      const ny = (dx / length) * 2.6;
      setAttrs(beam, { opacity: fixed(fade) });
      setAttrs(el("beam:cone"), {
        points: `${fixed(sx)},${fixed(sy)} ${fixed(ground.x + nx)},${fixed(ground.y + ny)} ${fixed(ground.x - nx)},${fixed(ground.y - ny)}`,
      });
      const axis = { x1: fixed(sx), y1: fixed(sy), x2: fixed(ground.x), y2: fixed(ground.y) };
      setAttrs(el("beam:axis"), axis);
      setAttrs(el("beam:grad"), axis);
      setAttrs(el("beam:ping"), { transform: `translate(${fixed(ground.x)} ${fixed(ground.y)})` });
      // Two rings half a beat apart, so the ping reads as a signal, not a blink.
      const ripple = (live.progress * 2) % 1;
      const ripple2 = (ripple + 0.5) % 1;
      setAttrs(el("beam:ring"), {
        r: fixed(1.5 + ripple * 7),
        "stroke-opacity": fixed(1 - ripple),
      });
      setAttrs(el("beam:ring2"), {
        r: fixed(1.5 + ripple2 * 7),
        "stroke-opacity": fixed(1 - ripple2),
      });
      setText(el("beam:place"), dateline.place.name.toUpperCase());
      setText(el("beam:date"), dateline.date.toUpperCase());

      for (const sat of SATELLITES) {
        const transmitting = sat.id === target.satellite;
        for (const side of ["far", "near"]) {
          setAttrs(el(`halo:${sat.id}:${side}`), {
            r: transmitting ? fixed(2.6 + 1.4 * fade) : 2.6,
            opacity: transmitting ? fixed(0.16 + 0.3 * fade) : 0.16,
          });
        }
      }
    },
    [translate, globeRadius, datelines, plan, satellites, watched]
  );

  return { bind, geometry, render };
}
