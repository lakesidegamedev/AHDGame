"use client";

/**
 * Landing globe: a lit 2D canvas drawn once, then only when the view changes
 * (drag, zoom, resize) or the sun moves (every five minutes). There is no
 * animation loop; an idle globe costs nothing.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { geoContains, geoOrthographic } from "d3-geo";
import type { Topology } from "topojson-specification";
import { fetchJson } from "@/lib/observability/fetchJson";
import { WORLD_GEO_URL } from "@/app/world/worldConstants";
import { ISO_TO_COUNTRY_ID } from "@/app/world/worldMetricHighlight";
import { resolveCountryAvailability } from "@/lib/countryAvailability";
import type { CountryId, CountryStatus } from "@/lib/constants/countriesCore";
import { WORLD_MAPPED_COUNTRIES } from "@/lib/worldCountryRegistry";
import { buildTierLookup, isTierInteractive } from "@/components/landing/countryTiers";
import { LANDING_MARKERS } from "@/components/landing/landingMarkers";
import {
  buildScene,
  projectPoint,
  renderGlobe,
  retintScene,
  type GlobeScene,
  type GlobeView,
} from "@/components/landing/globe/litGlobe";
import { subsolarPoint } from "@/components/landing/globe/sun";

type LandingCountryAccess = Partial<
  Record<string, { enabledForPlayers: boolean; economyPreview: boolean; status: CountryStatus }>
>;

const SUN_REFRESH_MS = 5 * 60_000;
const MAX_CANVAS_PX = 2048;
/** Sphere radius per viewBox-width unit, kept from the old 640x368 layout. */
const BASE_RADIUS = 152;
const VIEW_W = 640;
const VIEW_H = 368;

export function LandingGlobe({
  countryAccess,
  geoUrl,
  initialRotation = [48, -30, 0],
  initialZoom = 1,
  wireframeColor,
  playerCounts,
  battlegroundFeatureIds,
  economicPowerFeatureIds,
  backgroundMacroFeatureIds,
  markersFromSm = false,
  navigationDisabled = false,
  allowBareZoom = false,
  onReady,
}: {
  countryAccess?: LandingCountryAccess;
  geoUrl?: string;
  initialRotation?: [number, number, number];
  initialZoom?: number;
  /** Accent for coastlines on era looks that use one. */
  wireframeColor?: string;
  playerCounts?: Record<string, number>;
  battlegroundFeatureIds?: readonly string[];
  economicPowerFeatureIds?: readonly string[];
  backgroundMacroFeatureIds?: readonly string[];
  /** Hide the country chips below the sm breakpoint. */
  markersFromSm?: boolean;
  navigationDisabled?: boolean;
  allowBareZoom?: boolean;
  /** Fires once, after the first frame is on the canvas. */
  onReady?: () => void;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sceneRef = useRef<GlobeScene | null>(null);
  const rotationRef = useRef<[number, number, number]>([...initialRotation]);
  const zoomRef = useRef(initialZoom);
  const sunRef = useRef(subsolarPoint(new Date()));
  const viewRef = useRef<GlobeView | null>(null);
  const frameRef = useRef(0);
  const draggingRef = useRef(false);
  const readyRef = useRef(onReady);
  const firedRef = useRef(false);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  const tiers = useMemo(
    () =>
      buildTierLookup(
        ISO_TO_COUNTRY_ID,
        countryAccess,
        battlegroundFeatureIds ?? [],
        economicPowerFeatureIds ?? []
      ),
    [countryAccess, battlegroundFeatureIds, economicPowerFeatureIds]
  );
  const macro = useMemo(
    () => new Set(backgroundMacroFeatureIds ?? []),
    [backgroundMacroFeatureIds]
  );
  const kindOf = useCallback(
    (id: string) => {
      const tier = tiers.get(id) ?? "background";
      return tier === "background" && macro.has(id) ? "macro" : tier;
    },
    [tiers, macro]
  );
  const kindOfRef = useRef(kindOf);
  useEffect(() => {
    kindOfRef.current = kindOf;
  }, [kindOf]);

  const markers = useMemo(
    () => Object.entries(LANDING_MARKERS).filter(([id]) => countryAccess?.[id]?.enabledForPlayers),
    [countryAccess]
  );

  const draw = useCallback(() => {
    frameRef.current = 0;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!wrap || !canvas || !scene) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const radius = BASE_RADIUS * Math.min(w / VIEW_W, h / VIEW_H) * zoomRef.current;
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
    const view: GlobeView = {
      rotation: rotationRef.current,
      radius,
      cx: side / 2,
      cy: side / 2,
      dpr,
      sun: sunRef.current,
      dragging: draggingRef.current,
    };
    viewRef.current = view;
    renderGlobe(ctx, scene, view, wireframeColor);

    for (const [id, marker] of markers) {
      const chip = chipRefs.current[id];
      if (!chip) continue;
      const at = projectPoint(view, marker.lonLat);
      chip.style.display = at ? "" : "none";
      if (at) {
        chip.style.transform = `translate(${w / 2 - side / 2 + at[0]}px, ${h / 2 - side / 2 + at[1]}px) translate(-50%, ${marker.below ? "30%" : "-135%"})`;
      }
    }
    if (!firedRef.current) {
      firedRef.current = true;
      readyRef.current?.();
    }
  }, [markers, wireframeColor]);

  const requestDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Load the map once, then draw. Re-draw when the tiers change.
  useEffect(() => {
    let cancelled = false;
    void fetchJson<Topology>(geoUrl ?? WORLD_GEO_URL, { feature: "landing-globe" })
      .then((topology) => {
        if (cancelled) return;
        sceneRef.current = buildScene(topology, (id) => kindOfRef.current(id));
        requestDraw();
      })
      .catch((error: unknown) => {
        console.error("Landing globe map failed to load", error);
      });
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [geoUrl, requestDraw]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    retintScene(scene, kindOf);
    requestDraw();
  }, [kindOf, requestDraw]);

  // Sun and size: re-render only when something actually changed.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      sunRef.current = subsolarPoint(new Date());
      requestDraw();
    }, SUN_REFRESH_MS);
    const wrap = wrapRef.current;
    const observer = wrap ? new ResizeObserver(requestDraw) : null;
    if (wrap) observer?.observe(wrap);
    return () => {
      clearInterval(timer);
      observer?.disconnect();
    };
  }, [requestDraw]);

  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    d.x = event.clientX;
    d.y = event.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved < 4) return;
    draggingRef.current = true;
    const k = 0.3 / zoomRef.current;
    const rotation = rotationRef.current;
    rotationRef.current = [
      rotation[0] + dx * k,
      Math.max(-90, Math.min(90, rotation[1] - dy * k)),
      0,
    ];
    requestDraw();
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    if (wasDragging) {
      requestDraw();
      return;
    }
    const scene = sceneRef.current;
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!d || !scene || !view || !canvas || navigationDisabled) return;
    const rect = canvas.getBoundingClientRect();
    const projection = geoOrthographic()
      .translate([view.cx, view.cy])
      .scale(view.radius)
      .rotate(view.rotation)
      .clipAngle(90);
    const at = projection.invert?.([event.clientX - rect.left, event.clientY - rect.top]);
    if (!at) return;
    const hit = scene.land.find((land) => geoContains(land.geometry as never, at));
    if (!hit || !isTierInteractive(tiers.get(hit.id) ?? "background")) return;
    const countryId = ISO_TO_COUNTRY_ID[hit.id];
    const access = countryId ? countryAccess?.[countryId] : undefined;
    const target =
      (access && resolveCountryAvailability(countryId as CountryId, access).preferredPath) ||
      WORLD_MAPPED_COUNTRIES[hit.id]?.path;
    if (target) router.push(target);
  };
  const onWheel = (event: React.WheelEvent) => {
    if (!allowBareZoom) return;
    zoomRef.current = Math.max(
      0.8,
      Math.min(2.5, zoomRef.current * Math.exp(-event.deltaY * 0.001))
    );
    requestDraw();
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      {markers.map(([id, marker]) => (
        <div
          key={id}
          ref={(node) => {
            chipRefs.current[id] = node;
          }}
          style={{ display: "none" }}
          className={`pointer-events-none absolute left-0 top-0 ${markersFromSm ? "hidden sm:block" : ""}`}
        >
          <div className="rounded-lg border border-white/15 bg-black/55 px-2.5 py-1 text-center text-[11px] leading-tight text-white/90 backdrop-blur-sm">
            <div className="font-semibold uppercase tracking-wide">{marker.label}</div>
            <div className="text-white/60">{playerCounts?.[id] ?? 0} playing</div>
          </div>
        </div>
      ))}
    </div>
  );
}
