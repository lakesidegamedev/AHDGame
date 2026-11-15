/**
 * Draws the landing globe to a 2D canvas: ocean, land by tier, one soft
 * terminator with a twilight band, warm city glow on the night side and crisp
 * hairline borders. Pure canvas and maths, no React, no animation loop: callers
 * render when the view or the sun changes and never per idle frame.
 */
import { geoOrthographic, geoPath, geoRotation } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { CountryTier } from "../countryTiers";
import { NIGHT_CITIES } from "../nightCities";
import { daylight, smoothstep, type LonLat } from "./sun";

type GeoPermissibleObjects = object;

export type LandKind = CountryTier | "macro";

const LAND_FILL: Record<LandKind, string> = {
  background: "#2b3d54",
  macro: "#35335f",
  economic: "#2b6597",
  battleground: "#a85f2b",
  player: "#2fae6a",
};

const PLAYER_STROKE = "rgba(190, 255, 215, 0.95)";

export interface LandFeature {
  id: string;
  kind: LandKind;
  geometry: GeoPermissibleObjects;
}

export interface GlobeScene {
  land: LandFeature[];
  borders: GeoPermissibleObjects;
  coast: GeoPermissibleObjects;
}

export interface GlobeView {
  rotation: [number, number, number];
  /** Sphere radius in CSS px. */
  radius: number;
  /** Sphere centre in CSS px. */
  cx: number;
  cy: number;
  /** Device pixels per CSS px (the context is already scaled by it). */
  dpr: number;
  sun: LonLat;
  /** Coarser geometry and shading while the visitor drags. */
  dragging?: boolean;
}

export function buildScene(
  topology: Topology,
  kindOf: (featureId: string) => LandKind
): GlobeScene {
  const countries = topology.objects.countries as GeometryCollection;
  const collection = feature(topology, countries);
  const land = collection.features.map((f) => {
    const id = String(f.id);
    return { id, kind: kindOf(id), geometry: f as GeoPermissibleObjects };
  });
  return {
    land,
    borders: mesh(topology, countries, (a, b) => a !== b) as GeoPermissibleObjects,
    coast: mesh(topology, countries, (a, b) => a === b) as GeoPermissibleObjects,
  };
}

/** Re-colours existing land when the tiers change, without rebuilding geometry. */
export function retintScene(scene: GlobeScene, kindOf: (featureId: string) => LandKind): void {
  for (const land of scene.land) land.kind = kindOf(land.id);
}

/** Night-side colour for one sample of the sphere. Exported for tests. */
export function nightShade(cosZenith: number, z: number): [number, number, number, number] {
  const day = daylight(cosZenith);
  const night = 1 - day;
  const band = 4 * day * night;
  const nightAlpha = night * 0.8;
  const limbAlpha = Math.pow(1 - z, 1.8) * 0.38;
  const alpha = 1 - (1 - nightAlpha) * (1 - limbAlpha);
  const t = band * 0.5;
  return [
    Math.round(5 + (24 - 5) * t),
    Math.round(10 + (34 - 10) * t),
    Math.round(26 + (78 - 26) * t),
    Math.round(alpha * 255),
  ];
}

/** Fraction of full brightness a city light has at this sun angle. */
export function cityLightLevel(cosZenith: number): number {
  return 1 - smoothstep(-0.24, 0.0, cosZenith);
}

let bloomSprite: HTMLCanvasElement | null = null;
function bloom(): HTMLCanvasElement {
  if (bloomSprite) return bloomSprite;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 238, 200, 1)");
  grad.addColorStop(0.18, "rgba(255, 196, 120, 0.62)");
  grad.addColorStop(0.5, "rgba(255, 150, 70, 0.16)");
  grad.addColorStop(1, "rgba(255, 120, 40, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  bloomSprite = canvas;
  return canvas;
}

function drawShading(
  ctx: CanvasRenderingContext2D,
  view: GlobeView,
  sun: [number, number, number]
) {
  const { cx, cy, radius } = view;
  const cell = view.dragging ? 10 : 5;
  const n = Math.max(24, Math.ceil((radius * 2) / cell));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const g = canvas.getContext("2d")!;
  const image = g.createImageData(n, n);
  const data = image.data;
  for (let j = 0; j < n; j++) {
    const ny = 1 - ((j + 0.5) / n) * 2;
    for (let i = 0; i < n; i++) {
      const nx = ((i + 0.5) / n) * 2 - 1;
      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      const z = Math.sqrt(1 - r2);
      const [r, gr, b, a] = nightShade(nx * sun[0] + ny * sun[1] + z * sun[2], z);
      const o = (j * n + i) * 4;
      data[o] = r;
      data[o + 1] = gr;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  g.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, cx - radius, cy - radius, radius * 2, radius * 2);
}

export function renderGlobe(
  ctx: CanvasRenderingContext2D,
  scene: GlobeScene,
  view: GlobeView,
  accent?: string
): void {
  const { cx, cy, radius, rotation, dpr } = view;
  const hair = 1 / dpr;
  const rotate = geoRotation(rotation);
  const projection = geoOrthographic()
    .translate([cx, cy])
    .scale(radius)
    .rotate(rotation)
    .clipAngle(90)
    .precision(view.dragging ? 1.5 : 0.4);
  const path = geoPath(projection, ctx);

  // Sun in view space: x right, y up, z toward the viewer.
  const [sl, sp] = rotate(view.sun as [number, number]);
  const cp = Math.cos((sp * Math.PI) / 180);
  const sun: [number, number, number] = [
    cp * Math.sin((sl * Math.PI) / 180),
    Math.sin((sp * Math.PI) / 180),
    cp * Math.cos((sl * Math.PI) / 180),
  ];

  ctx.save();
  // Atmosphere glow outside the limb.
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.99, cx, cy, radius * 1.075);
  glow.addColorStop(0, "rgba(90, 170, 255, 0.24)");
  glow.addColorStop(1, "rgba(90, 170, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.075, 0, Math.PI * 2);
  ctx.fill();

  // Ocean.
  const ocean = ctx.createRadialGradient(
    cx + radius * sun[0] * 0.3,
    cy - radius * sun[1] * 0.3,
    radius * 0.1,
    cx,
    cy,
    radius
  );
  ocean.addColorStop(0, "#194778");
  ocean.addColorStop(1, "#0a2444");
  ctx.fillStyle = ocean;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Land by tier.
  for (const land of scene.land) {
    ctx.beginPath();
    path(land.geometry);
    ctx.fillStyle = LAND_FILL[land.kind];
    ctx.fill();
  }

  // Borders under the shading so they dim with the night; coasts a touch brighter.
  ctx.lineJoin = "round";
  ctx.lineWidth = hair;
  ctx.strokeStyle = accent ? `${accent}66` : "rgba(205, 220, 240, 0.34)";
  ctx.beginPath();
  path(scene.borders);
  ctx.stroke();
  ctx.lineWidth = hair * 1.25;
  ctx.strokeStyle = accent ?? "rgba(140, 200, 240, 0.7)";
  ctx.beginPath();
  path(scene.coast);
  ctx.stroke();

  drawShading(ctx, view, sun);

  // Player nations stay lit through the night.
  ctx.lineWidth = hair * 1.5;
  ctx.strokeStyle = PLAYER_STROKE;
  ctx.fillStyle = "rgba(120, 255, 175, 0.07)";
  for (const land of scene.land) {
    if (land.kind !== "player") continue;
    ctx.beginPath();
    path(land.geometry);
    ctx.fill();
    ctx.stroke();
  }

  // City glow, night side only.
  const sprite = bloom();
  ctx.globalCompositeOperation = "lighter";
  for (const [lon, lat, weight] of NIGHT_CITIES) {
    const [l, p] = rotate([lon, lat]);
    const cosP = Math.cos((p * Math.PI) / 180);
    const z = cosP * Math.cos((l * Math.PI) / 180);
    if (z < 0.04) continue;
    const x = cosP * Math.sin((l * Math.PI) / 180);
    const y = Math.sin((p * Math.PI) / 180);
    const level = cityLightLevel(x * sun[0] + y * sun[1] + z * sun[2]);
    if (level < 0.02) continue;
    const fore = 0.55 + 0.45 * z;
    const r = radius * (0.011 + 0.0075 * weight) * fore;
    const px = cx + radius * x;
    const py = cy - radius * y;
    ctx.globalAlpha = Math.min(1, level * (0.28 + 0.15 * weight) * fore);
    ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
    if (weight >= 2) {
      ctx.globalAlpha = level * 0.1 * fore;
      ctx.drawImage(sprite, px - r * 3.4, py - r * 3.4, r * 6.8, r * 6.8);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // Limb rim, static.
  const rim = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius);
  rim.addColorStop(0, "rgba(110, 190, 255, 0)");
  rim.addColorStop(1, "rgba(130, 205, 255, 0.34)");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Screen position of a lon/lat, or null on the far side. */
export function projectPoint(view: GlobeView, lonLat: LonLat): [number, number] | null {
  const [l, p] = geoRotation(view.rotation)(lonLat as [number, number]);
  const cosP = Math.cos((p * Math.PI) / 180);
  if (cosP * Math.cos((l * Math.PI) / 180) < 0.05) return null;
  return [
    view.cx + view.radius * cosP * Math.sin((l * Math.PI) / 180),
    view.cy - view.radius * Math.sin((p * Math.PI) / 180),
  ];
}
