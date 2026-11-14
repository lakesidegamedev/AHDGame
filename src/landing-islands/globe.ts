/**
 * The interactive globe for the static landing page. Loaded only after the page
 * is idle, the globe box is on screen and the visitor has interacted or waited.
 * It draws once, then only on drag, resize or a five-minute sun update, and
 * fades in over the poster.
 */
import { geoContains, geoOrthographic } from "d3-geo";
import type { Topology } from "topojson-specification";
import {
  buildScene,
  projectPoint,
  renderGlobe,
  type GlobeScene,
  type GlobeView,
  type LandKind,
} from "../components/landing/globe/litGlobe";
import { subsolarPoint } from "../components/landing/globe/sun";

interface GlobeConfig {
  geoUrl: string;
  rotation: [number, number, number];
  zoom: number;
  /** Feature id to kind letter: p player, e economic, b battleground, m macro. */
  kinds: Record<string, string>;
  /** Feature id to the page a click opens. */
  nav: Record<string, string>;
  markers: {
    id: string;
    label: string;
    lonLat: [number, number];
    below?: boolean;
    count: number;
  }[];
}

const KINDS: Record<string, LandKind> = {
  p: "player",
  e: "economic",
  b: "battleground",
  m: "macro",
};
const MAX_CANVAS_PX = 2048;
const BASE_RADIUS = 152;
const VIEW_W = 640;
const VIEW_H = 368;

const box = document.getElementById("globe-box") as HTMLElement | null;
const config = JSON.parse(document.getElementById("landing-config")?.textContent ?? "{}").globe as
  GlobeConfig | undefined;

async function start(host: HTMLElement, cfg: GlobeConfig) {
  const topology = (await (await fetch(cfg.geoUrl)).json()) as Topology;
  const scene: GlobeScene = buildScene(topology, (id) => KINDS[cfg.kinds[id]] ?? "background");

  const layer = document.createElement("div");
  layer.className = "absolute inset-0 touch-pan-y select-none";
  layer.style.opacity = "0";
  layer.style.transition = "opacity 500ms";
  const canvas = document.createElement("canvas");
  canvas.className = "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
  layer.appendChild(canvas);
  const chips = cfg.markers.map((marker) => {
    const chip = document.createElement("div");
    chip.className = "pointer-events-none absolute left-0 top-0 hidden sm:block";
    chip.style.display = "none";
    chip.innerHTML =
      '<div class="rounded-lg border border-white/15 bg-black/55 px-2.5 py-1 text-center text-[11px] leading-tight text-white/90"></div>';
    const inner = chip.firstElementChild as HTMLElement;
    const name = document.createElement("div");
    name.className = "font-semibold uppercase tracking-wide";
    name.textContent = marker.label;
    const count = document.createElement("div");
    count.className = "text-white/60";
    count.textContent = `${marker.count} playing`;
    inner.append(name, count);
    layer.appendChild(chip);
    return { marker, chip };
  });
  host.appendChild(layer);

  let rotation = [...cfg.rotation] as [number, number, number];
  let sun = subsolarPoint(new Date());
  let view: GlobeView | null = null;
  let frame = 0;
  let dragging = false;
  let drawn = false;

  const draw = () => {
    frame = 0;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    const radius = BASE_RADIUS * Math.min(w / VIEW_W, h / VIEW_H) * cfg.zoom;
    const side = Math.min(Math.ceil(radius * 2.3), Math.max(w, h));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_PX / side);
    const px = Math.round(side * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, side, side);
    view = { rotation, radius, cx: side / 2, cy: side / 2, dpr, sun, dragging };
    renderGlobe(ctx, scene, view);
    for (const { marker, chip } of chips) {
      const at = projectPoint(view, marker.lonLat);
      chip.style.display = at ? "" : "none";
      if (at) {
        chip.style.transform = `translate(${w / 2 - side / 2 + at[0]}px, ${h / 2 - side / 2 + at[1]}px) translate(-50%, ${marker.below ? "30%" : "-135%"})`;
      }
    }
    if (!drawn) {
      drawn = true;
      layer.style.opacity = "1";
      const poster = host.querySelector<HTMLElement>("[data-globe-poster]");
      if (poster) poster.style.opacity = "0";
    }
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  new ResizeObserver(request).observe(host);
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    sun = subsolarPoint(new Date());
    request();
  }, 5 * 60_000);

  let drag: { x: number; y: number; moved: number } | null = null;
  layer.addEventListener("pointerdown", (event) => {
    drag = { x: event.clientX, y: event.clientY, moved: 0 };
    layer.setPointerCapture(event.pointerId);
  });
  layer.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 4) return;
    dragging = true;
    const k = 0.3 / cfg.zoom;
    rotation = [rotation[0] + dx * k, Math.max(-90, Math.min(90, rotation[1] - dy * k)), 0];
    request();
  });
  const release = (event: PointerEvent) => {
    const wasDragging = dragging;
    const start = drag;
    drag = null;
    dragging = false;
    if (wasDragging) return request();
    if (!start || !view) return;
    const rect = canvas.getBoundingClientRect();
    const projection = geoOrthographic()
      .translate([view.cx, view.cy])
      .scale(view.radius)
      .rotate(view.rotation)
      .clipAngle(90);
    const at = projection.invert?.([event.clientX - rect.left, event.clientY - rect.top]);
    if (!at) return;
    const hit = scene.land.find((land) => geoContains(land.geometry, at));
    const target = hit ? cfg.nav[hit.id] : undefined;
    if (target) location.assign(target);
  };
  layer.addEventListener("pointerup", release);
  layer.addEventListener("pointercancel", release);
  request();
}

if (box && config) void start(box, config).catch(() => undefined);
