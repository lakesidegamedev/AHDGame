"use client";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { RegionOverlayShard } from "@/lib/maps/regionOverlay";
import { fetchMapJson, reportMapLoadFailure } from "@/lib/maps/mapLoad";
import { useWorldMapState } from "@/app/world/components/useWorldMapState";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";

import {
  WORLD_GEO_URL,
  SVG_W,
  SVG_H,
  TRANSLATE,
  ORTHO_SCALE,
  ANIM_DURATION,
  easeInOutCubic,
} from "../worldConstants";
import { WORLD_COUNTRY_ISO_TO_ID, WORLD_MAPPED_COUNTRIES } from "@/lib/worldCountryRegistry";
import MapControls from "./MapControls";
import WorldMapTooltip from "./WorldMapTooltip";
import MapSVGContent, { BACKGROUND_LAYER_KEY } from "./MapSVGContent";
import { isTierInteractive } from "@/components/landing/countryTiers";

import { REGION_SHARDS } from "@/lib/maps/regionManifest";
import { computeRegionBlobs, selectStructuralOverlayShards } from "@/lib/maps/regionOverlay";
import { WORLD_OVERLAY_OWNER_FOLD } from "@/lib/maps/germanyGeometry";
import { VIETNAM_BASE_FEATURE_ID, VIETNAM_GEO_URL } from "@/lib/maps/vietnamGeometry";
import { HISTORICAL_GEO_URL } from "@/lib/maps/historicalGeometry";
import { simplifyForGlobe } from "@/lib/maps/simplifyForGlobe";
import GlobeMetricPanel from "./GlobeMetricPanel";

import {
  getCategoryAverageLabel,
  getMapTooltipAccessDisplay,
  ISO_TO_COUNTRY_ID,
} from "../worldMetricHighlight";
import { getMetricFilterHighlight } from "../worldMetricFilterHighlight";
import { type CountryId } from "@/lib/constants/countriesCore";

import BackgroundMacroInspector from "./BackgroundMacroInspector";
import CountryComparePanel from "./CountryComparePanel";

export default function WorldMapSVG(...args: Parameters<typeof useWorldMapState>) {
  const prepared = useWorldMapState(...args);
  const {
    activeBlocLookup,
    activeTierLookup,
    blocLookup,
    blocLookupRef,
    blocPalette,
    blocsAvailable,
    cardRef,
    compareCountryIds,
    compareMode,
    corpsData,
    countryAccess,
    countryIdToIso,
    countryName,
    getCountryColor,
    graticuleRef,
    hovered,
    inspectableFeatureIds,
    inspectableFeatureIdsRef,
    isAnimating,
    isDragging,
    isFullscreen,
    isLoaded,
    livePathsRef,
    metricFilter,
    partyData,
    pathRefsMap,
    paths,
    router,
    selectedMacro,
    setCompareMode,
    setHovered,
    setIsAnimating,
    setIsDragging,
    setIsFullscreen,
    setIsLoaded,
    setMetricFilter,
    setPaths,
    setSelectedMacro,
    setTooltipPos,
    setViewMode,
    sphereRef,
    svgRef,
    tierLookupRef,
    toggleCompareCountry,
    tooltipPos,
    useTierRendering,
    viewMode,
    warBorderPathRef,
    worldEntities,
    worldMetrics,
  } = prepared.context;

  // Lookup form for the renderer: the globe strokes both comparison picks so the
  // two sides stay visible while the panel is open.
  const comparedCountryIds = useMemo(() => new Set(compareCountryIds), [compareCountryIds]);

  const warBorderFeatureRef = useRef<Feature | null>(null);
  const warBorderInitialDRef = useRef<string>("");

  const featuresRef = useRef<Feature[]>([]);
  const centroidsRef = useRef<Map<string, [number, number]>>(new Map());
  // Countries fully drawn by a region-overlay `bi:` blob: their base countries-110m feature is hidden so its internal borders don't bleed through the overlay. `bi:` is now any manifest shard, not just British Isles.
  const biCoveredRef = useRef<Set<string>>(new Set());
  const graticuleDataRef = useRef<MultiLineString | null>(null);
  const d3Ref = useRef<typeof import("d3-geo") | null>(null);
  const eeScaleRef = useRef(148);

  const viewModeRef = useRef<"map" | "globe">("globe");
  const rotationRef = useRef<[number, number, number]>([0, 0, 0]);
  const mapPanRef = useRef<[number, number]>([0, 0]);
  const zoomRef = useRef(1);
  const hoveredRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const isAnimatingRef = useRef(false);
  const animFrameRef = useRef(0);
  const dragFrameRef = useRef(0);
  const autoRotateRef = useRef(0);

  // --- Imperative path update for current viewMode (drag, zoom, auto-rotate) ---
  const imperativeUpdate = useCallback(() => {
    const d3 = d3Ref.current;
    if (!d3 || !featuresRef.current.length) return;

    const z = zoomRef.current;
    let proj;
    if (viewModeRef.current === "map") {
      proj = d3
        .geoEqualEarth()
        .scale(eeScaleRef.current * z)
        .translate([TRANSLATE[0] + mapPanRef.current[0], TRANSLATE[1] + mapPanRef.current[1]]);
    } else {
      proj = d3
        .geoOrthographic()
        .scale(ORTHO_SCALE * z)
        .translate(TRANSLATE)
        .rotate(rotationRef.current)
        .clipAngle(90 + 1e-6);
    }

    const pathGen = d3.geoPath(proj);
    const lookup = tierLookupRef.current;
    const blocs = blocLookupRef.current;
    // Background Nations are accumulated into ONE `d` string written once,
    // instead of ~120 individual setAttribute calls every animation frame.
    //
    // Bloc members and inspectable aggregates are excluded here, exactly as
    // they are excluded from the merged layer in MapSVGContent. The two rules have to
    // agree: when only the renderer knew about bloc members, they were drawn
    // once at mount and then never reprojected — so Canada and the Benelux sat
    // frozen in place while the globe turned under them, AND their geometry went
    // into the merged layer as well, drawing them twice.
    let backgroundD = "";
    for (const feature of featuresRef.current) {
      const id = String(feature.id);
      if (
        lookup &&
        !isTierInteractive(lookup.get(id) ?? "background") &&
        !blocs?.get(id) &&
        !inspectableFeatureIdsRef.current.has(id)
      ) {
        const d = pathGen(feature);
        // Recorded like any other feature: `commitLivePaths` re-derives the
        // merged layer from these, so hovering must not blank the background.
        livePathsRef.current.set(id, d);
        if (d) backgroundD += d;
        continue;
      }
      const el = pathRefsMap.current.get(id);
      if (!el) continue;
      const d = pathGen(feature);
      // Remember the geometry this frame actually drew, so a re-render caused by
      // hover can repaint at the CURRENT rotation without reprojecting the world
      // (see commitLivePaths).
      livePathsRef.current.set(id, d);
      if (d) {
        el.setAttribute("d", d);
        el.style.opacity = "1";
      } else {
        el.style.opacity = "0";
      }
    }
    if (lookup) {
      const backgroundEl = pathRefsMap.current.get(BACKGROUND_LAYER_KEY);
      if (backgroundEl) backgroundEl.setAttribute("d", backgroundD);
    }

    if (graticuleRef.current && graticuleDataRef.current) {
      const d = pathGen(graticuleDataRef.current);
      if (d) graticuleRef.current.setAttribute("d", d);
    }

    if (sphereRef.current && viewModeRef.current === "globe") {
      sphereRef.current.setAttribute("r", String(ORTHO_SCALE * z));
    }

    if (warBorderPathRef.current && warBorderFeatureRef.current) {
      const d = pathGen(warBorderFeatureRef.current);
      if (d) {
        warBorderPathRef.current.setAttribute("d", d);
        warBorderPathRef.current.style.opacity = "1";
      } else {
        warBorderPathRef.current.style.opacity = "0";
      }
    }
  }, [
    blocLookupRef,
    graticuleRef,
    inspectableFeatureIdsRef,
    livePathsRef,
    pathRefsMap,
    sphereRef,
    tierLookupRef,
    warBorderPathRef,
  ]);

  /**
   * Publish the geometry the imperative loop already drew into React state,
   * without reprojecting anything.
   *
   * Hover and drag-release use this. Reprojecting the whole world on every
   * mouse-enter is wasted work, since neither changes the projection.
   */
  const commitLivePaths = useCallback(() => {
    if (!livePathsRef.current.size) return;
    setPaths(new Map(livePathsRef.current));
  }, [livePathsRef, setPaths]);

  const selectMacro = useCallback(
    (entityId: string | null) => {
      commitLivePaths();
      setSelectedMacro(entityId);
    },
    [commitLivePaths, setSelectedMacro]
  );

  // --- Sync React paths state with current projection (view/zoom changes) ---
  const syncPathsState = useCallback(() => {
    const d3 = d3Ref.current;
    if (!d3 || !featuresRef.current.length) return;

    const z = zoomRef.current;
    let proj;
    if (viewModeRef.current === "map") {
      proj = d3
        .geoEqualEarth()
        .scale(eeScaleRef.current * z)
        .translate([TRANSLATE[0] + mapPanRef.current[0], TRANSLATE[1] + mapPanRef.current[1]]);
    } else {
      proj = d3
        .geoOrthographic()
        .scale(ORTHO_SCALE * z)
        .translate(TRANSLATE)
        .rotate(rotationRef.current)
        .clipAngle(90 + 1e-6);
    }

    const pathGen = d3.geoPath(proj);
    const newPaths = new Map<string, string | null>();
    for (const feature of featuresRef.current) {
      newPaths.set(String(feature.id), pathGen(feature));
    }
    livePathsRef.current = new Map(newPaths);

    if (graticuleRef.current && graticuleDataRef.current) {
      graticuleRef.current.setAttribute("d", pathGen(graticuleDataRef.current) || "");
      graticuleRef.current.style.opacity = viewModeRef.current === "globe" ? "0.3" : "0";
    }
    if (sphereRef.current) {
      sphereRef.current.style.opacity = viewModeRef.current === "globe" ? "1" : "0";
      if (viewModeRef.current === "globe") {
        sphereRef.current.setAttribute("r", String(ORTHO_SCALE * z));
      }
    }
    for (const [id, el] of pathRefsMap.current) {
      if (el) el.style.opacity = newPaths.get(id) !== null ? "1" : "0";
    }

    if (warBorderPathRef.current && warBorderFeatureRef.current) {
      const d = pathGen(warBorderFeatureRef.current);
      if (d) {
        warBorderPathRef.current.setAttribute("d", d);
        warBorderPathRef.current.style.opacity = "1";
      } else {
        warBorderPathRef.current.style.opacity = "0";
      }
    }

    setPaths(newPaths);
  }, [graticuleRef, livePathsRef, pathRefsMap, setPaths, sphereRef, warBorderPathRef]);

  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // --- Load d3-geo + topojson data on mount ---
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);

    async function load() {
      const [d3, topojson] = await Promise.all([import("d3-geo"), import("topojson-client")]).catch(
        (err) => {
          reportMapLoadFailure("chunk", "d3-geo,topojson-client", err);
          throw err;
        }
      );
      if (cancelled) return;
      d3Ref.current = d3;

      const topo = await fetchMapJson<Topology<{ countries: GeometryCollection }>>(
        WORLD_GEO_URL,
        undefined,
        "world-topology"
      );
      if (cancelled) return;

      const geojson: FeatureCollection<Geometry> = topojson.feature(topo, topo.objects.countries);

      // The two Vietnams. Static features rather than a region shard, because
      // the shard machinery resolves owners from `states` and neither is a full
      // country (see vietnamGeometry). Unified Vietnam's 704 is dropped: it does
      // not exist in 1953, and leaving it would draw an uncoloured background
      // country underneath both halves.
      try {
        {
          const vn = await fetchMapJson<FeatureCollection<Geometry>>(
            VIETNAM_GEO_URL,
            { cache: "no-store" },
            "world-vietnam"
          );
          if (vn?.features?.length) {
            geojson.features = geojson.features.filter(
              (f: { id?: unknown }) => String(f.id) !== VIETNAM_BASE_FEATURE_ID
            );
            geojson.features.push(...vn.features);
          }
        }
      } catch {
        // Best-effort, exactly like the region overlay: without it Vietnam draws
        // as one unified background country rather than not at all.
      }

      featuresRef.current = geojson.features;

      const centroids = new Map<string, [number, number]>();
      for (const f of geojson.features) {
        centroids.set(String(f.id), d3.geoCentroid(f));
      }

      // Region overlay: geometrically UNION each owning country's regions into one
      // blob so it reads as a single nation: one national outline, no internal region
      // lines, and a region that changes country moves between blobs, the internal
      // border vanishing as they fuse. A true union (not an arc merge) is required
      // because some source regions come from independently digitized datasets whose
      // shared borders don't share vertices; an arc merge leaves coincident lines.
      // Structural shards feed this loop (splits + multi-base silhouettes). Pure
      // homeland-detail shards keep their countries-110m base. Region codes are
      // globally disjoint, so each owner's blob falls out. Appended AFTER country
      // features so they draw on top.
      //
      // A source is only overlaid when EVERY one of its regions is owned. Hiding a
      // base polygon (biCovered) but leaving part un-blobbed shows the hidden
      // background through the gap (e.g. mid-reset, before East Germany's Länder
      // seed, would render East Germany as ocean). A partially-owned source is
      // skipped so its base polygon draws normally until seeding completes.
      try {
        // Only overlay shards flagged mergeable — a shard whose regions don't union
        // cleanly (Brazil) keeps its clean base polygon (manifest worldOverlay:false).
        // Ownership is fetched FIRST so we can skip downloading homeland-detail
        // shards that structural mode will not overlay — that download+parse was
        // the main first-open hitch on mobile (USA/France/Japan/… GeoJSON).
        const candidateShards = REGION_SHARDS.filter((s) => s.worldOverlay !== false);
        const [pcMod, ownResp] = await Promise.all([
          import("polygon-clipping"),
          fetchMapJson<{ ownership?: Record<string, string> }>(
            "/api/maps/region-ownership",
            { cache: "no-store" },
            "world-ownership"
          ),
        ]);
        const ownership: Record<string, string> = ownResp?.ownership ?? {};
        const overlayShards = selectStructuralOverlayShards(candidateShards, ownership);
        const shardGeos = cancelled
          ? []
          : await Promise.all(
              overlayShards.map((s) =>
                fetchMapJson<RegionOverlayShard>(s.url, { cache: "no-store" }, "world-shard")
              )
            );
        const sources: Pick<RegionOverlayShard, "features">[] = shardGeos;
        if (!cancelled && sources.some((s) => s?.features?.length)) {
          const polygonClipping: Parameters<typeof computeRegionBlobs>[3] = {
            union: (poly, ...rest) =>
              (pcMod.default ?? pcMod).union(
                poly as import("polygon-clipping").Polygon,
                ...(rest as import("polygon-clipping").Polygon[])
              ),
          };
          // Structural overlays only: splits (DE/DD) and multi-base silhouettes
          // (USSR, YU, …). Single-homeland detail shards (USA/France/Japan/…) stay
          // on their countries-110m polygons — at globe scale the extra coastline
          // is invisible, and projecting it every frame was ~30× slower than the
          // landing globe. No homeland fusion: an acquirer's blob sits adjacent
          // to its base polygon in the same colour.
          const { blobs, coveredBases } = computeRegionBlobs(
            overlayShards.map((s, i) => ({
              baseCountryIds: s.baseCountryIds,
              features: sources[i]?.features ?? [],
            })),
            ownership,
            WORLD_OVERLAY_OWNER_FOLD,
            polygonClipping,
            "structural"
          );
          for (const [owner, solidCW] of blobs) {
            const coordinates = simplifyForGlobe(
              solidCW.map((poly) =>
                poly.map((ring) => {
                  // Re-wrap any unwrapped (>180) longitudes back into −180..180 — the
                  // soviet-union shard is authored unwrapped (Far East past the
                  // antimeridian) for the flat nation map; the union is clean in that
                  // continuous space, but d3's antimeridian clipping needs standard
                  // coords to render the blob on the globe + flat world map.
                  const wrapped = ring.map(([lon, lat]) => [lon > 180 ? lon - 360 : lon, lat]);
                  // Orient each ring so its spherical interior is the SMALLER region —
                  // d3 then fills the blob as land (a ring whose winding makes the
                  // interior the whole sphere would otherwise flood the globe).
                  return d3.geoArea({ type: "Polygon", coordinates: [wrapped] }) > 2 * Math.PI
                    ? [...wrapped].reverse()
                    : wrapped;
                })
              )
            );
            if (!coordinates.length) continue;
            const blob: Feature<Geometry> = {
              type: "Feature",
              id: `bi:${owner}`,
              properties: { ownerCountryId: owner },
              geometry: { type: "MultiPolygon", coordinates },
            };
            geojson.features.push(blob);
            centroids.set(`bi:${owner}`, d3.geoCentroid(blob));
          }
          biCoveredRef.current = coveredBases;
          // Covered bases are not mounted in the DOM — drop them from the
          // projection loop so we don't pay geoPath for geometry nobody draws.
          if (coveredBases.size) {
            geojson.features = geojson.features.filter((f) => {
              const id = String(f.id);
              if (id.startsWith("bi:")) return true;
              const countryId = WORLD_COUNTRY_ISO_TO_ID[id];
              const featureName = f.properties?.name;
              return (
                !coveredBases.has(id) &&
                !(countryId && coveredBases.has(countryId)) &&
                !(featureName && coveredBases.has(featureName))
              );
            });
            featuresRef.current = geojson.features;
          }
        }
      } catch {
        // overlay is best-effort — the base country map still renders without it
      }

      // Historical territories (protectorates, trust territories, international
      // zones) that sit inside a modern country and have no ISO numeric.
      // They do NOT replace a base feature: the Saar draws on top of Germany,
      // Zanzibar on top of Tanzania.
      //
      // ⚠️ Appended LAST, after the region-overlay blobs. d3 draws in array
      // order, and appending earlier buried territories whose host has a region
      // shard under the host's blob. Placed after the overlay's try/catch so a
      // failed overlay does not also drop these.
      //
      // Only visible in HEATMAP modes; in structural modes they are
      // background-tier and merged into a silhouette.
      try {
        {
          const hist = await fetchMapJson<FeatureCollection<Geometry>>(
            HISTORICAL_GEO_URL,
            { cache: "no-store" },
            "world-historical"
          );
          for (const f of hist?.features ?? []) {
            geojson.features.push(f);
            // The centroid pass ran before these existed, so each one is set here —
            // without it every label and zoom-to lookup misses these territories.
            centroids.set(String(f.id), d3.geoCentroid(f));
          }
          featuresRef.current = geojson.features;
        }
      } catch {
        // Best-effort: without it those territories are simply not drawn, which is
        // the behaviour that shipped before they existed.
      }

      centroidsRef.current = centroids;

      const eeProj = d3.geoEqualEarth().fitSize([SVG_W, SVG_H], { type: "Sphere" });
      eeScaleRef.current = eeProj.scale();

      graticuleDataRef.current = d3.geoGraticule10();

      // Default to globe projection
      const initProj = d3
        .geoOrthographic()
        .scale(ORTHO_SCALE)
        .translate(TRANSLATE)
        .rotate(rotationRef.current)
        .clipAngle(90 + 1e-6);
      const pathGen = d3.geoPath(initProj);
      const initialPaths = new Map<string, string | null>();
      for (const f of geojson.features) {
        initialPaths.set(String(f.id), pathGen(f));
      }
      livePathsRef.current = new Map(initialPaths);
      setPaths(initialPaths);
      setIsLoaded(true);
    }

    load().catch((err) => {
      if (cancelled) return;
      reportMapLoadFailure("world-load", WORLD_GEO_URL, err);
      setLoadFailed(true);
    });

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
      if (autoRotateRef.current) cancelAnimationFrame(autoRotateRef.current);
    };
  }, [livePathsRef, setIsLoaded, setPaths, loadAttempt]);

  // --- Auto-rotation loop (runs only while the globe is on screen and idle) ---
  useEffect(() => {
    if (!isLoaded) return;
    const card = cardRef.current;

    // The loop reprojects every frame, so skip it when the globe is off
    // screen or the tab is backgrounded.
    let onScreen = true;
    const observer =
      card && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((entry) => entry.isIntersecting);
            },
            { threshold: 0 }
          )
        : null;
    observer?.observe(card as Element);

    // Cap idle spin at ~30fps. Drag/zoom still call imperativeUpdate directly
    // at full rate; this only throttles the background autorotate that nobody
    // is steering.
    const SPIN_FRAME_MS = 1000 / 30;
    let lastSpinAt = 0;
    const spin = (now: number) => {
      if (
        onScreen &&
        !document.hidden &&
        viewModeRef.current === "globe" &&
        !isDraggingRef.current &&
        !isAnimatingRef.current &&
        !hoveredRef.current &&
        now - lastSpinAt >= SPIN_FRAME_MS
      ) {
        lastSpinAt = now;
        // Two 60fps ticks' worth of rotation per 30fps frame so angular speed
        // matches the previous 0.12°/raf cadence.
        rotationRef.current = [rotationRef.current[0] + 0.24, rotationRef.current[1], 0];
        imperativeUpdate();
      }
      autoRotateRef.current = requestAnimationFrame(spin);
    };

    autoRotateRef.current = requestAnimationFrame(spin);
    return () => {
      observer?.disconnect();
      if (autoRotateRef.current) cancelAnimationFrame(autoRotateRef.current);
    };
  }, [isLoaded, imperativeUpdate, cardRef]);

  /**
   * Switching between a structural view (Blocs / Tiers) and a data heatmap
   * changes WHICH features get their own path element — Background Nations are
   * merged into one inert layer in tier mode and split back out otherwise. The
   * newly mounted paths would otherwise take their `d` from stale React state
   * and snap the globe back to wherever it was at the last sync.
   */
  useEffect(() => {
    if (!isLoaded) return;
    commitLivePaths();
  }, [useTierRendering, isLoaded, commitLivePaths]);

  // --- Wheel zoom (native listener for passive:false) ---
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !isLoaded) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (isAnimatingRef.current) return;
      const factor = e.deltaY > 0 ? 0.94 : 1.06;
      zoomRef.current = Math.max(0.8, Math.min(3, zoomRef.current * factor));
      imperativeUpdate();
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [isLoaded, imperativeUpdate, cardRef]);

  // --- Animated projection transition ---
  const startTransition = useCallback(
    (target: "map" | "globe") => {
      if (isAnimatingRef.current || viewModeRef.current === target) return;
      const d3 = d3Ref.current;
      if (!d3) return;

      isAnimatingRef.current = true;
      setIsAnimating(true);

      const eeRaw = d3.geoEqualEarthRaw;
      const orthoRaw = d3.geoOrthographicRaw;
      const eeScale = eeScaleRef.current;
      const zoom = zoomRef.current;

      const isToGlobe = target === "globe";
      const startT = isToGlobe ? 0 : 1;
      const endT = isToGlobe ? 1 : 0;

      // Preserve rotation: globe remembers where user was looking
      const globeRot: [number, number, number] = [...rotationRef.current];
      const mapRot: [number, number, number] = [0, 0, 0];
      const startRot = isToGlobe ? mapRot : globeRot;
      const endRot = isToGlobe ? globeRot : mapRot;

      const startTime = performance.now();

      const animate = (now: number) => {
        const progress = Math.min((now - startTime) / ANIM_DURATION, 1);
        const eased = easeInOutCubic(progress);
        const t = startT + (endT - startT) * eased;

        const rot: [number, number, number] = [
          startRot[0] + (endRot[0] - startRot[0]) * eased,
          startRot[1] + (endRot[1] - startRot[1]) * eased,
          0,
        ];

        const s = ((1 - t) * eeScale + t * ORTHO_SCALE) * zoom;
        const proj = d3
          .geoProjection((lambda: number, phi: number) => {
            const [ex, ey] = eeRaw(lambda, phi);
            const [ox, oy] = orthoRaw(lambda, phi);
            const eeS = eeScale * zoom;
            const orthoS = ORTHO_SCALE * zoom;
            return [
              ((1 - t) * ex * eeS + t * ox * orthoS) / s,
              ((1 - t) * ey * eeS + t * oy * orthoS) / s,
            ] as [number, number];
          })
          .scale(s)
          .translate(TRANSLATE)
          .rotate(rot)
          .precision(0.5);

        const pathGen = d3.geoPath(proj);

        for (const feature of featuresRef.current) {
          const id = String(feature.id);
          const el = pathRefsMap.current.get(id);
          if (!el) continue;

          const d = pathGen(feature);
          if (d) {
            el.setAttribute("d", d);

            if (t > 0.3) {
              const centroid = centroidsRef.current.get(id);
              if (centroid) {
                const [lon, lat] = centroid;
                const cosAngle =
                  Math.cos(((lon + rot[0]) * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180);
                if (cosAngle < 0) {
                  const fade = Math.min(1, (t - 0.3) / 0.5);
                  el.style.opacity = String(Math.max(0, 1 - fade));
                } else {
                  el.style.opacity = "1";
                }
              }
            } else {
              el.style.opacity = "1";
            }
          } else {
            el.style.opacity = "0";
          }
        }

        if (sphereRef.current) {
          sphereRef.current.style.opacity = String(t);
          sphereRef.current.setAttribute("r", String(ORTHO_SCALE * zoom));
        }

        if (graticuleRef.current && graticuleDataRef.current) {
          const gd = pathGen(graticuleDataRef.current);
          if (gd) {
            graticuleRef.current.setAttribute("d", gd);
            graticuleRef.current.style.opacity = String(t * 0.3);
          }
        }

        if (warBorderPathRef.current && warBorderFeatureRef.current) {
          const wd = pathGen(warBorderFeatureRef.current);
          if (wd) {
            warBorderPathRef.current.setAttribute("d", wd);
            warBorderPathRef.current.style.opacity = "1";
          } else {
            warBorderPathRef.current.style.opacity = "0";
          }
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        } else {
          viewModeRef.current = target;
          setViewMode(target);
          // Don't reset rotationRef - preserve globe position for future transitions
          isAnimatingRef.current = false;
          setIsAnimating(false);
          syncPathsState();
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [
      graticuleRef,
      pathRefsMap,
      setIsAnimating,
      setViewMode,
      sphereRef,
      syncPathsState,
      warBorderPathRef,
    ]
  );

  // --- Mouse handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isAnimatingRef.current) {
      const svg = svgRef.current;
      if (svg && svg.contains(e.target as Node)) {
        isDraggingRef.current = true;
        setIsDragging(true);
        lastPosRef.current = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      lastPosRef.current = null;
      // The drag loop already projected this exact frame — publish it, don't
      // recompute it.
      commitLivePaths();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isAnimatingRef.current && !isDraggingRef.current && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (isDraggingRef.current && lastPosRef.current) {
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;

      if (viewModeRef.current === "globe") {
        rotationRef.current = [
          rotationRef.current[0] + dx * 0.4,
          Math.max(-90, Math.min(90, rotationRef.current[1] - dy * 0.4)),
          0,
        ];
      } else {
        mapPanRef.current = [mapPanRef.current[0] + dx, mapPanRef.current[1] + dy];
      }

      lastPosRef.current = { x: e.clientX, y: e.clientY };

      if (!dragFrameRef.current) {
        dragFrameRef.current = requestAnimationFrame(() => {
          imperativeUpdate();
          dragFrameRef.current = 0;
        });
      }
    }
  };

  // --- Touch handlers ---
  const lastTouchDistRef = useRef<number | null>(null);
  const touchMovedRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchPathRef = useRef<Element | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;

    if (e.touches.length === 2) {
      touchMovedRef.current = true;
      touchPathRef.current = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      return;
    }

    const touch = e.touches[0];
    const svg = svgRef.current;
    if (svg && svg.contains(e.target as Node)) {
      commitLivePaths();
      isDraggingRef.current = true;
      setIsDragging(true);
      lastPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      const path = document.elementFromPoint(touch.clientX, touch.clientY)?.closest("path");
      touchPathRef.current = path && svg.contains(path) ? path : null;
      touchMovedRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
      touchMovedRef.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = dist / lastTouchDistRef.current;
      zoomRef.current = Math.max(0.8, Math.min(3, zoomRef.current * factor));
      lastTouchDistRef.current = dist;
      imperativeUpdate();
      return;
    }

    if (!isDraggingRef.current || !lastPosRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - lastPosRef.current.x;
    const dy = touch.clientY - lastPosRef.current.y;

    const start = touchStartPosRef.current;
    if (start && (Math.abs(touch.clientX - start.x) > 3 || Math.abs(touch.clientY - start.y) > 3)) {
      touchMovedRef.current = true;
    }

    if (viewModeRef.current === "globe") {
      rotationRef.current = [
        rotationRef.current[0] + dx * 0.4,
        Math.max(-90, Math.min(90, rotationRef.current[1] - dy * 0.4)),
        0,
      ];
    } else {
      mapPanRef.current = [mapPanRef.current[0] + dx, mapPanRef.current[1] + dy];
    }

    lastPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (!dragFrameRef.current) {
      dragFrameRef.current = requestAnimationFrame(() => {
        imperativeUpdate();
        dragFrameRef.current = 0;
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchDistRef.current = null;

    if (isDraggingRef.current) {
      e.preventDefault();
      const end = e.changedTouches[0];
      const start = touchStartPosRef.current;
      if (
        end &&
        start &&
        (Math.abs(end.clientX - start.x) > 3 || Math.abs(end.clientY - start.y) > 3)
      )
        touchMovedRef.current = true;
      isDraggingRef.current = false;
      setIsDragging(false);
      lastPosRef.current = null;
      commitLivePaths();

      // If tap (no significant movement), navigate to country at touch point
      if (
        e.type === "touchend" &&
        !touchMovedRef.current &&
        touchStartPosRef.current &&
        e.changedTouches.length > 0
      ) {
        const touch = e.changedTouches[0];
        const pathEl = touchPathRef.current;
        if (pathEl && svgRef.current?.contains(pathEl)) {
          // Consume this tap once. A second compatibility click can hit a
          // different country after opening the inspector changes the layout.
          pathEl.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              clientX: touch.clientX,
              clientY: touch.clientY,
            })
          );
        }
      }
    }
    touchStartPosRef.current = null;
    touchPathRef.current = null;
  };

  const handleCountryClick = (id: string) => {
    if (isAnimatingRef.current) return;

    // Comparison mode turns the globe into a picker: a click chooses a side
    // instead of opening the nation, so two countries can be read side by side
    // without leaving the map.
    if (compareMode) {
      const picked = id.startsWith("bi:")
        ? (id.slice(3).split(":")[0] as CountryId)
        : (ISO_TO_COUNTRY_ID[id] as CountryId | undefined);
      if (picked) {
        toggleCompareCountry(picked);
        return;
      }
    }

    if (inspectableFeatureIds.has(id)) {
      selectMacro(worldEntities.byFeatureId[id].entityId);
      return;
    }
    // Region-overlay feature → its live owner's country map (any manifest shard).
    // Id is `bi:<owner>:<regionCode>` (or legacy `bi:<owner>`) — take the owner.
    if (id.startsWith("bi:")) {
      const owner = id.slice(3).split(":")[0];
      if (owner) router.push(`/country/${owner.toLowerCase()}/map`);
      return;
    }
    const mapped = WORLD_MAPPED_COUNTRIES[id];
    if (!mapped?.path) return;

    // Every registered country is reachable: playable ones to act in, econ-only
    // ones to browse read-only. Unregistered countries render on the globe (via
    // WORLD_COUNTRY_ISO_TO_ID) but are absent from `countryAccess`, so they stay
    // unclickable.
    const slug = mapped.path.split("/").pop()?.toUpperCase();
    if (slug && !(slug in countryAccess)) return;

    router.push(mapped.path);
  };

  // Close fullscreen on Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen, setIsFullscreen]);

  // Trigger re-render of paths when entering/exiting fullscreen
  useEffect(() => {
    if (isLoaded) {
      // Small delay to let the container resize, then sync paths
      const id = requestAnimationFrame(() => syncPathsState());
      return () => cancelAnimationFrame(id);
    }
  }, [isFullscreen, isLoaded, syncPathsState]);

  // A region-overlay blob is `bi:<ownerCountryId>`; resolve it to the owner's
  // base ISO so the tooltip shows the owning country.
  const hoveredIso = hovered
    ? hovered.startsWith("bi:")
      ? countryIdToIso(hovered.slice(3).split(":")[0] as CountryId)
      : hovered
    : undefined;
  const hoveredMapped = hoveredIso ? WORLD_MAPPED_COUNTRIES[hoveredIso] : null;
  const hoveredMacro =
    hovered && inspectableFeatureIds.has(hovered) ? worldEntities.byFeatureId[hovered] : null;
  const hoveredIsoCountryId = hovered?.startsWith("bi:")
    ? (hovered.slice(3).split(":")[0] as CountryId)
    : hoveredIso
      ? ISO_TO_COUNTRY_ID[hoveredIso]
      : undefined;
  // Era-aware tooltip label (e.g. "West Germany" in 1979) when the hovered base
  // country maps to a CountryId; otherwise fall back to the static registry label.
  const hoveredLabel = hoveredMacro
    ? hoveredMacro.displayName
    : hoveredIsoCountryId && hoveredMapped
      ? countryName(hoveredIsoCountryId)
      : (hoveredMapped?.label ?? "");

  const tooltipAccess = hoveredMacro
    ? { label: "Background macro simulation", tone: "planned" as const }
    : hovered
      ? getMapTooltipAccessDisplay(hovered, hoveredMapped?.status, countryAccess)
      : null;

  // In bloc mode the tooltip answers the question the map is asking — whose
  // side is this? — rather than a metric value.
  const hoveredBloc = hovered ? blocLookup.get(hovered) : undefined;

  const tooltipFilterHighlight =
    metricFilter.type === "blocs"
      ? hoveredBloc
        ? { label: "Bloc", value: blocPalette[hoveredBloc]?.label ?? hoveredBloc }
        : null
      : hoveredIsoCountryId && metricFilter.type !== "none"
        ? getMetricFilterHighlight(
            metricFilter,
            hoveredIsoCountryId,
            countryIdToIso(hoveredIsoCountryId),
            worldMetrics,
            partyData,
            corpsData
          )
        : null;

  const mergedTooltipHighlight =
    metricFilter.type === "category" && tooltipFilterHighlight
      ? {
          label: getCategoryAverageLabel(metricFilter.categoryId),
          value: tooltipFilterHighlight.value,
        }
      : tooltipFilterHighlight;

  const showTooltipClickHint = compareMode
    ? Boolean(hoveredIsoCountryId)
    : Boolean(
        hoveredMapped?.path &&
        hoveredIsoCountryId &&
        // Latent world-map countries (e.g. RU) render on the globe via
        // WORLD_COUNTRY_ISO_TO_ID but are absent from the registered countryAccess
        // map — guard so hovering them doesn't throw.
        hoveredIsoCountryId in countryAccess
      );

  // Only the DATA heatmaps count as an active filter. Blocs and Tiers are
  // structural views handled by tierLookup/blocLookup, not by getCountryColor.
  const hasActiveFilter = metricFilter.type !== "none" && metricFilter.type !== "blocs";

  return (
    <>
      <div
        ref={cardRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-[60] bg-background overflow-hidden"
            : "relative overflow-hidden rounded-xl border border-card-border bg-card shadow-lg"
        }
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          handleMouseUp();
          hoveredRef.current = null;
          setHovered(null);
          setTooltipPos(null);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
      >
        <MapControls
          viewMode={viewMode}
          isAnimating={isAnimating}
          isFullscreen={isFullscreen}
          compareMode={compareMode}
          onCompareToggle={() => setCompareMode(!compareMode)}
          onViewChange={startTransition}
          onFullscreenToggle={() => setIsFullscreen((v) => !v)}
          zoomRef={zoomRef}
          imperativeUpdate={imperativeUpdate}
          syncPathsState={syncPathsState}
        />

        {!isLoaded && (
          <div
            className={`w-full flex items-center justify-center text-muted text-body ${isFullscreen ? "h-full" : ""}`}
            style={isFullscreen ? undefined : { aspectRatio: `${SVG_W}/${SVG_H}` }}
          >
            {loadFailed ? (
              <span className="text-center">
                The map could not be loaded.{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setLoadAttempt((n) => n + 1)}
                >
                  Try again
                </button>
              </span>
            ) : (
              "Loading map..."
            )}
          </div>
        )}

        {isLoaded && (
          <MapSVGContent
            svgRef={svgRef}
            sphereRef={sphereRef}
            graticuleRef={graticuleRef}
            warBorderPathRef={warBorderPathRef}
            pathRefsMap={pathRefsMap}
            features={featuresRef.current}
            warBorderInitialD={warBorderInitialDRef.current}
            paths={paths}
            hovered={hovered}
            isAnimating={isAnimating}
            hasActiveFilter={hasActiveFilter}
            isFullscreen={isFullscreen}
            getCountryColor={getCountryColor}
            isAnimatingRef={isAnimatingRef}
            viewModeRef={viewModeRef}
            hoveredRef={hoveredRef}
            // Hover repaints at the geometry already on screen. It must NOT
            // reproject — that was the single biggest source of map lag.
            syncPathsState={commitLivePaths}
            tierLookup={activeTierLookup}
            inspectableFeatureIds={inspectableFeatureIds}
            blocLookup={activeBlocLookup}
            blocPalette={blocPalette}
            onHover={setHovered}
            onTooltipClear={() => setTooltipPos(null)}
            onCountryClick={handleCountryClick}
            countryAccess={countryAccess}
            worldEntities={worldEntities}
            biCoveredCountries={biCoveredRef.current}
            comparedCountryIds={comparedCountryIds}
          />
        )}

        {hoveredLabel && tooltipPos && tooltipAccess && !isAnimating && (
          <WorldMapTooltip
            countryLabel={hoveredLabel}
            position={tooltipPos}
            access={tooltipAccess}
            filterHighlight={mergedTooltipHighlight}
            corpsCount={
              hovered && metricFilter.type === "corps"
                ? corpsData?.countries[hovered]?.count
                : undefined
            }
            showClickHint={showTooltipClickHint}
            clickHint={compareMode ? "Click to compare" : undefined}
          />
        )}

        {/* Metric filter panel — normal and fullscreen map */}
        <GlobeMetricPanel
          filter={metricFilter}
          onFilterChange={setMetricFilter}
          availableCategories={worldMetrics?.availableCategories ?? []}
          availableMetrics={worldMetrics?.availableMetrics ?? {}}
          blocsAvailable={blocsAvailable}
          blocPalette={blocPalette}
        />
      </div>
      <CountryComparePanel fullscreen={isFullscreen} />
      <BackgroundMacroInspector
        snapshot={worldEntities}
        selectedEntityId={selectedMacro}
        onSelect={selectMacro}
        fullscreen={isFullscreen}
      />
    </>
  );
}
