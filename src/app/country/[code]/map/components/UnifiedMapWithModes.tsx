"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { SectionLabel } from "@/components/ui";
import type { CountryMapViewConfig } from "../mapViewConfig";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { COMMODITY_LABELS, EXTRACTABLE_RESOURCES } from "@/lib/constants/commoditiesCore";
import type { ExtractableResource } from "@/lib/constants/commoditiesCore";
import type { MapOverviewResponse } from "@/lib/map/overviewTypes";
import { regionUrl } from "@/lib/urls";
import { fetchJson } from "@/lib/observability/fetchJson";
import { type LeanAxis, leanHalfRange } from "./mapShared";
import styles from "./atlas.module.css";
import { LeanMapLegend } from "./LeanMapLegend";
import { StateLeanPanel } from "./StateLeanPanel";
import { useResourceMapData } from "./useResourceMapData";
import { useFreightDemandData } from "./useFreightDemandData";
import { freightHaulLoadCaption } from "./freightHaulLoadCopy";
import { COUNTRY_MAP_CONFIGS, type CountryMapConfig, type MapGameTime } from "./countryMapConfigs";

interface UnifiedMapWithModesProps {
  mapData: MapOverviewResponse | null;
  config: CountryMapViewConfig;
  /** Optional so the dispatcher can load this chunk without the config table. */
  countryConfig?: CountryMapConfig;
  onRegionClick: (id: string) => void;
}

export function UnifiedMapWithModes({
  mapData,
  config,
  countryConfig: countryConfigProp,
  onRegionClick,
}: UnifiedMapWithModesProps) {
  const countryConfig =
    countryConfigProp ?? COUNTRY_MAP_CONFIGS[config.id as CountryMapConfig["countryId"]];
  // Era-aware display name (e.g. "West Germany Map" in 1979), and runtime
  // renames with it (a reunified Germany is not "East Germany Map").
  const displayName = useCountryDisplayName()(countryConfig.countryId);
  const [mode, setMode] = useState<string>(countryConfig.defaultMode);
  const [leanAxis, setLeanAxis] = useState<LeanAxis>("display");
  // Region whose demographic breakdown is open (lean mode click; null = closed).
  const [leanDetailId, setLeanDetailId] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState<ExtractableResource>("oil");
  const [resourceToggle, setResourceToggle] = useState<
    "capacity" | "contractedPct" | "openAccessPct"
  >("capacity");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [gameTime, setGameTime] = useState<MapGameTime | undefined>(undefined);

  // Fetch current game time so country renderers can swap era-specific assets
  // (e.g. CN's pre-handover map omits HK/Macau). Endpoint is edge-cached so
  // this is cheap per page navigation.
  useEffect(() => {
    let cancelled = false;
    fetchJson<{ currentTurn?: number; startingYear?: number; preIterationTurns?: number }>(
      "/api/game/turn/status",
      {
        feature: "country-map-turn-status",
      }
    )
      .then((data) => {
        if (cancelled || !data) return;
        setGameTime({
          currentTurn: data.currentTurn,
          startingYear: data.startingYear,
          preIterationTurns: data.preIterationTurns,
        });
      })
      .catch(() => {
        // Network failure: leave gameTime undefined; renderers fall back to modern assets.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resourceData = useResourceMapData(mode, config.id, resourceType);
  const freightData = useFreightDemandData(mode, config.id);

  const regionData = useMemo(
    () =>
      countryConfig.buildRegionData({
        mode,
        mapData,
        leanAxis,
        resourceData,
        resourceToggle,
        freightData,
      }),
    [countryConfig, mode, mapData, leanAxis, resourceData, resourceToggle, freightData]
  );

  const selectRegion = (id: string) => {
    setSelectedId(id);
    setLeanDetailId(mode === "lean" ? id : null);
  };
  const modeConfig = countryConfig.modes.find((m) => m.id === mode);

  // Every parliamentary map renders the LIVE region roster: the regions whose
  // `states.countryId` is this country right now, i.e. `mapData.regions`, so a
  // split or transfer follows its owner. While the overview is still loading,
  // or if a country's state `_id`s don't intersect this map's region codes,
  // fall back to the config's static roster so the map and list never render empty.
  const rosterIds: string[] | null =
    mapData?.regions && mapData.regions.length > 0 ? mapData.regions.map((r) => r.id) : null;
  const liveRegions = rosterIds
    ? countryConfig.regions.filter((r) => rosterIds.includes(r.id))
    : null;
  const useLive = liveRegions !== null && liveRegions.length > 0;
  const regionsShown = useLive ? liveRegions! : countryConfig.regions;
  const liveRoster: string[] | null = useLive ? regionsShown.map((r) => r.id) : null;
  // Maps that can recompute their subtitle from the shown set (DE: era-split, so
  // 1979 reads "11 Länder") provide `formatSubtitle` and use it. The rest keep
  // the static, canonical-total `headerSubtitle` — a region-summed UK figure
  // (652) would drift from the nation-sourced 650, so UK opts out until the
  // territory-transfer mechanic generalizes live seat totals.
  const subtitle = countryConfig.formatSubtitle
    ? countryConfig.formatSubtitle(regionsShown)
    : countryConfig.headerSubtitle;

  const selectedRegion = regionsShown.find((r) => r.id === selectedId);
  const selectedCell = selectedId ? regionData[selectedId] : undefined;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-10 lg:px-12">
        <div className="mb-4 sm:mb-6 flex items-center gap-3">
          <BackButton iconOnly />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {displayName} Map
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="mb-4 sm:mb-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2 min-w-max sm:flex-wrap sm:min-w-0 pb-1">
            {countryConfig.modes.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  setLeanDetailId(null);
                }}
                className={`shrink-0 rounded-lg border px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                  mode === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-card-border bg-card text-muted hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === "resources" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex flex-wrap gap-1">
                {EXTRACTABLE_RESOURCES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setResourceType(r)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      resourceType === r
                        ? "bg-primary text-white"
                        : "bg-card-elevated text-muted hover:text-foreground"
                    }`}
                  >
                    {COMMODITY_LABELS[r]}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["capacity", "contractedPct", "openAccessPct"] as const).map((tog) => (
                  <button
                    key={tog}
                    onClick={() => setResourceToggle(tog)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      resourceToggle === tog
                        ? "bg-primary text-white"
                        : "bg-card-elevated text-muted hover:text-foreground"
                    }`}
                  >
                    {tog === "capacity"
                      ? "Capacity"
                      : tog === "contractedPct"
                        ? "Contracted %"
                        : "Open-access %"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "logistics" && (
            <p className="mt-3 text-xs text-muted">
              {freightHaulLoadCaption(Object.keys(freightData.states).length > 0)}
            </p>
          )}
        </div>

        {/* Outside the horizontally-scrolling mode-chip strip: on mobile the
            strip scrolls to reach "Lean", which pushed this toggle off-screen. */}
        {mode === "lean" && (
          <div className="-mt-2 mb-4 flex gap-2 sm:-mt-4 sm:mb-6">
            {(["display", "economic", "social"] as const).map((ax) => (
              <button
                key={ax}
                onClick={() => setLeanAxis(ax)}
                className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                  leanAxis === ax
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-card-border bg-card text-muted hover:text-foreground"
                }`}
              >
                {ax === "display" ? "Combined" : ax === "economic" ? "Economic" : "Social"}
              </button>
            ))}
          </div>
        )}

        <div className={styles.workspace}>
          <div className="min-w-0 rounded-xl border border-card-border bg-card overflow-hidden">
            <div className="border-b border-card-border px-4 py-3 text-body-sm text-muted">
              {modeConfig?.description}
            </div>
            <div className={styles.mapStage}>
              {countryConfig.renderPaths({
                regionData,
                onRegionClick: selectRegion,
                gameTime,
                regionCodes: liveRoster ?? undefined,
                mapProps: {
                  zoom,
                  onZoomChange: setZoom,
                  resetKey,
                  showLabels,
                  hideCrowdedLabels: true,
                  highlightColor: "var(--primary)",
                  highlightedRegions: selectedId ? [selectedId] : [],
                },
              })}
            </div>
            <div className={styles.mapFooter}>
              <span>Hover a region for details. Select one to inspect it.</span>
              <div className={styles.zoomControls}>
                <label className="mr-2 flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                  Labels
                </label>
                <button
                  className={styles.iconButton}
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                >
                  −
                </button>
                <span className="w-10 text-center font-mono">{zoom.toFixed(1)}×</span>
                <button
                  className={styles.iconButton}
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                >
                  +
                </button>
                <button
                  className="ml-2 text-xs"
                  onClick={() => {
                    setZoom(1);
                    setResetKey((k) => k + 1);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
            {mode === "lean" && mapData?.lean && (
              <div className="px-5 pb-4">
                <LeanMapLegend
                  axis={leanAxis}
                  halfRange={leanHalfRange(mapData.lean, leanAxis)}
                  european={countryConfig.leanEuropean}
                />
              </div>
            )}
          </div>

          <aside className={styles.sidebar} aria-label="Region details">
            <div className="rounded-xl border border-card-border bg-card p-4">
              {selectedRegion ? (
                <>
                  <SectionLabel className="mb-2">Selected region</SectionLabel>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: selectedCell?.color ?? "#334155" }}
                    />
                    <h2 className="text-lg font-semibold">{selectedRegion.name}</h2>
                  </div>
                  {selectedCell?.label && selectedCell.label !== selectedRegion.name && (
                    <p className="mt-1 text-sm text-foreground">{selectedCell.label}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">{selectedRegion.secondaryLabel}</p>
                  {selectedCell?.tooltip && selectedCell.tooltip.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-muted">
                      {selectedCell.tooltip
                        .filter((line) => line !== selectedRegion.name)
                        .map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                    </ul>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Link
                      href={regionUrl(countryConfig.countryId, selectedRegion.id)}
                      className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium hover:border-primary/50"
                    >
                      Open region
                    </Link>
                    <button
                      className="text-xs text-muted hover:text-foreground"
                      onClick={() => {
                        setSelectedId(null);
                        setLeanDetailId(null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Select a region on the map to see its details for this layer.
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="mt-4 rounded-xl border border-card-border bg-card p-4 sm:p-6">
          <SectionLabel className="mb-4">{countryConfig.regionListHeading}</SectionLabel>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {regionsShown.map((region) => {
              const d = regionData[region.id];
              return (
                <Link
                  key={region.id}
                  href={regionUrl(countryConfig.countryId, region.id)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-card-elevated/50 group"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: d?.color ?? "#334155" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {region.name}
                    </div>
                    <div className="truncate text-[10px] text-muted">{d?.label ?? region.name}</div>
                  </div>
                  <span className="text-sm text-muted">{region.secondaryLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {mode === "lean" && leanDetailId && (
          <StateLeanPanel
            key={leanDetailId}
            countryCode={countryConfig.countryId}
            stateId={leanDetailId}
            onClose={() => setLeanDetailId(null)}
          />
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-card-border/40">
          <Link
            href={config.overviewPath}
            className="rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            ← {displayName} Overview
          </Link>
        </div>
      </main>
    </div>
  );
}
