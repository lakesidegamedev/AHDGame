"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MAP_COLORS } from "@/app/world/worldConstants";

import { buildTierLookup, isTierInteractive } from "@/components/landing/countryTiers";
import { buildBlocLookup, buildBlocPalette, hasBlocData } from "@/app/world/worldBlocs";
import type { BlocMapData } from "@/lib/world/blocMembership";

import type { CountryAccessMap } from "@/app/world/page";
import { useWorldMetricFilter } from "@/app/world/WorldMetricFilterContext";
import { ISO_TO_COUNTRY_ID } from "@/app/world/worldMetricHighlight";

import { useActivePreset, useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import type { WorldEntityMapSnapshot } from "@/lib/world/worldEntityMap";
import { backgroundMacroFeatureIds } from "@/lib/world/worldEntityMapInspection";

export function useWorldMapState({
  countryAccess,
  worldEntities,
  blocMapData,
}: {
  countryAccess: CountryAccessMap;
  worldEntities: WorldEntityMapSnapshot;
  blocMapData: BlocMapData;
}) {
  const router = useRouter();
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const inspectableFeatureIds = useMemo(
    () => backgroundMacroFeatureIds(worldEntities),
    [worldEntities]
  );
  const inspectableFeatureIdsRef = useRef(inspectableFeatureIds);
  useEffect(() => {
    inspectableFeatureIdsRef.current = inspectableFeatureIds;
  }, [inspectableFeatureIds]);
  const preset = useActivePreset();
  const countryName = useCountryDisplayName();
  const {
    metricFilter,
    setMetricFilter,
    worldMetrics,
    partyData,
    corpsData,
    countryIdToIso,
    compareMode,
    setCompareMode,
    toggleCompareCountry,
  } = useWorldMetricFilter();
  const blocsAvailable = hasBlocData(preset, blocMapData.customBlocs.length);

  useEffect(() => {
    if (metricFilter.type === "blocs" && !blocsAvailable) setMetricFilter({ type: "none" });
  }, [blocsAvailable, metricFilter.type, setMetricFilter]);

  // --- React state ---
  const [viewMode, setViewMode] = useState<"map" | "globe">("globe");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [paths, setPaths] = useState<Map<string, string | null>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Four-tier / bloc coloring -------------------------------------------
  // Tier rosters come straight from the era's world-entity manifest snapshot
  // (already fetched server-side for this page), so /world never maintains a
  // second hand-written list the way the landing bundle has to.
  const { economicPowerFeatureIds, battlegroundFeatureIds } = useMemo(() => {
    const economic: string[] = [];
    const battleground: string[] = [];
    for (const [featureId, item] of Object.entries(worldEntities.byFeatureId)) {
      if (item.simulationTier === "full-autonomous") economic.push(featureId);
      else if (item.simulationTier === "sphere-macro") battleground.push(featureId);
    }
    return { economicPowerFeatureIds: economic, battlegroundFeatureIds: battleground };
  }, [worldEntities]);

  /**
   * Feature id → tier, built once per era rather than per path per frame. An
   * absent key means Background Nations. Active aggregate records opt into
   * inspection separately; unsimulated land remains in the merged inert path.
   */
  const tierLookup = useMemo(
    () =>
      buildTierLookup(
        ISO_TO_COUNTRY_ID,
        countryAccess,
        battlegroundFeatureIds,
        economicPowerFeatureIds
      ),
    [countryAccess, battlegroundFeatureIds, economicPowerFeatureIds]
  );

  /**
   * Bloc colours come from the live roll, scoped to what the globe already draws
   * as interactive — so a country the era names but no alliance has claimed
   * reads as non-aligned, while a background non-member stays out of it.
   */
  const blocLookup = useMemo(
    () =>
      buildBlocLookup({
        presetId: preset,
        membership: blocMapData.membership,
        customBlocCount: blocMapData.customBlocs.length,
        interactiveFeatureIds: [...tierLookup]
          .filter(([, tier]) => isTierInteractive(tier))
          .map(([featureId]) => featureId),
      }),
    [preset, blocMapData, tierLookup]
  );
  const blocPalette = useMemo(
    () => buildBlocPalette(blocMapData.customBlocs, blocMapData.membership),
    [blocMapData]
  );

  /**
   * Tier rendering owns the map in the two "structural" modes. The data
   * heatmaps (overall / category / metric / party / corps) still need every
   * feature individually paintable, so they fall back to the legacy path.
   */
  const useTierRendering = metricFilter.type === "none" || metricFilter.type === "blocs";
  const activeTierLookup = useTierRendering ? tierLookup : undefined;
  const activeBlocLookup = metricFilter.type === "blocs" ? blocLookup : undefined;
  const tierLookupRef = useRef(activeTierLookup);
  useEffect(() => {
    tierLookupRef.current = activeTierLookup;
  }, [activeTierLookup]);
  // Mirrored into a ref for the same reason as the tier lookup: the per-frame
  // updater below runs outside React and must not close over a stale value.
  const blocLookupRef = useRef(activeBlocLookup);
  useEffect(() => {
    blocLookupRef.current = activeBlocLookup;
  }, [activeBlocLookup]);

  /** Convert a 0-100 score to a heatmap color (red→yellow→green) */
  const scoreToColor = (score: number): string => {
    // 0 = deep red, 50 = yellow-orange, 100 = green
    if (score >= 75) {
      // green range
      const t = (score - 75) / 25;
      return `rgba(34, ${160 + Math.round(t * 40)}, ${80 + Math.round(t * 20)}, 0.85)`;
    }
    if (score >= 50) {
      // yellow-green
      const t = (score - 50) / 25;
      return `rgba(${180 - Math.round(t * 146)}, ${140 + Math.round(t * 20)}, ${40 + Math.round(t * 40)}, 0.85)`;
    }
    if (score >= 25) {
      // orange-yellow
      const t = (score - 25) / 25;
      return `rgba(${220 - Math.round(t * 40)}, ${80 + Math.round(t * 60)}, 30, 0.8)`;
    }
    // red range
    const t = score / 25;
    return `rgba(${160 + Math.round(t * 60)}, ${30 + Math.round(t * 50)}, 30, 0.75)`;
  };

  /** Convert corps count to intensity color (light → dark blue) */
  const corpsCountToColor = (count: number, maxCount: number): string => {
    if (maxCount <= 0) return "rgba(59, 130, 246, 0.2)";
    const t = Math.min(1, count / maxCount);
    // Light blue (low) → deep blue (high)
    const r = Math.round(219 - t * 160);
    const g = Math.round(234 - t * 130);
    const b = Math.round(254 - t * 40);
    const alpha = 0.4 + t * 0.55;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getCountryColor = useCallback(
    (id: string, defaultColor: string) => {
      // Econ-only tint when no filter is active.
      if (metricFilter.type === "none") {
        const countryId = ISO_TO_COUNTRY_ID[id];
        if (countryId && countryAccess[countryId]) {
          // Every country in `countryAccess` is registered, so "not enabled for
          // players" is exactly the econ-only tier. Intentionally NOT gated on
          // `status` — a "beta" country can sit here too.
          if (!countryAccess[countryId].enabledForPlayers) {
            return MAP_COLORS.econOnly;
          }
        }
        return defaultColor;
      }

      if (metricFilter.type === "party") {
        return partyData[id]?.partyColor || defaultColor;
      }

      if (metricFilter.type === "corps") {
        const entry = corpsData?.countries[id];
        if (!entry) return defaultColor;
        return corpsCountToColor(entry.count, corpsData?.maxCount ?? 1);
      }

      // All other filters require world metrics data
      const country = worldMetrics?.countries[id];
      if (!country?.hasData) return defaultColor;

      if (metricFilter.type === "overall") {
        if (country.overallScore === null) return defaultColor;
        return scoreToColor(country.overallScore);
      }

      if (metricFilter.type === "category") {
        const catScore = country.categoryScores[metricFilter.categoryId];
        if (catScore === null || catScore === undefined) return defaultColor;
        return scoreToColor(catScore);
      }

      if (metricFilter.type === "metric") {
        const metricEntry = country.categories[metricFilter.categoryId]?.[metricFilter.metricId];
        if (metricEntry?.score === null || metricEntry?.score === undefined) return defaultColor;
        return scoreToColor(metricEntry.score);
      }

      return defaultColor;
    },
    [metricFilter, worldMetrics, partyData, corpsData, countryAccess]
  );

  // --- Refs (no re-renders) ---
  const cardRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefsMap = useRef<Map<string, SVGPathElement>>(new Map());
  /**
   * The `d` string most recently WRITTEN to each path by the imperative loop.
   *
   * Rotation updates the DOM directly and deliberately skips React, so the
   * `paths` state is stale. Without this ref, a re-render from a hover or
   * tooltip would repaint every country from stale state and snap the globe
   * back.
   */
  const livePathsRef = useRef<Map<string, string | null>>(new Map());
  const sphereRef = useRef<SVGCircleElement>(null);
  const graticuleRef = useRef<SVGPathElement>(null);
  const warBorderPathRef = useRef<SVGPathElement>(null);
  return {
    kind: "context" as const,
    context: {
      activeBlocLookup,
      activeTierLookup,
      blocLookup,
      blocLookupRef,
      blocPalette,
      blocsAvailable,
      cardRef,
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
    },
  };
}
