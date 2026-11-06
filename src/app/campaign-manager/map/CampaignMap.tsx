"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import { useBlendGround } from "@/components/blend/useBlendGround";
import {
  MIN_ZOOM,
  viewForBox,
  type MapFrame,
  type MapView,
} from "@/app/elections/[id]/blend/presMap/mapView";
import { usePanZoom } from "@/app/elections/[id]/blend/presMap/usePanZoom";
import { shadeColorForTier } from "@/lib/elections/marginTierShade";
import type { MarginTier } from "@/lib/elections/generalViewModel";
import {
  filterRaces,
  partyLines,
  regionFill,
  type CmRace,
  type RaceFilter,
} from "@/lib/campaignManager/rules";
import { typeLabel } from "../raceLabels";
import { ratingChipStyle } from "../ui";
import { loadCampaignGeo, type CampaignGeo } from "./geoSource";
import { countySourceFor, unitRowsFrom, visibleRegions, type UnitRow } from "./mapModel";
import { useRegionUnits, type RegionUnitRequest } from "./useRegionUnits";
import { useRegionShapes } from "./useRegionShapes";

export interface CampaignMapProps {
  countryId: string;
  countryName: string;
  regionNoun: string;
  races: CmRace[];
  filter: RaceFilter;
  selectedRace: CmRace | null;
  onSelectRegion: (regionId: string) => void;
  onCanvass?: () => void;
  /** A completed turn: sub-unit results are re-read. */
  turn?: number | null;
}

const TIERS: MarginTier[] = ["tossup", "lean", "likely", "safe"];
const NEIGHBOUR_OPACITY = 0.32;
const FAR_OPACITY = 0.2;
/** Deep enough to read a small county once its state is already in view. */
const MAP_FRAME: MapFrame = { maxZoom: 24 };
const FIT_PADDING = 0.12;

/**
 * The country, shaded race by race for the chosen type and stage. Picking a
 * region zooms to it and draws its sub-units from the selected race's results;
 * every other region in view keeps its own sub-units, faded, so the race reads
 * in context. Labels are HTML over the map so they stay crisp at any zoom.
 * The map drags to pan and zooms by its buttons, the wheel or a pinch, as the
 * country maps do: a wheel over the map zooms it instead of scrolling the page.
 */
export function CampaignMap(props: CampaignMapProps) {
  const t = useTranslations("elections.campaignManager");
  const ground = useBlendGround();
  const [geo, setGeo] = useState<CampaignGeo | null | undefined>(undefined);
  const [unitPick, setUnitPick] = useState<{ region: string; id: string } | null>(null);
  // A gesture moves the map at once; a pick, a button or a reset glides there.
  const [glide, setGlide] = useState(true);
  const [frameWidth, setFrameWidth] = useState(0);
  const [partyOverlay, setPartyOverlay] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const { filter, races, selectedRace } = props;
  const sel = filter.regionId !== "ALL" ? filter.regionId : null;
  const fitBox = useMemo(() => {
    const bb = geo && sel ? geo.regions[sel]?.bb : undefined;
    return bb ? { x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] } : null;
  }, [geo, sel]);

  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setFrameWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mapW = geo?.w ?? 1;
  const pz = usePanZoom({
    svgRef,
    enabled: !!geo,
    scale: (frameWidth || mapW) / mapW,
    width: mapW,
    height: geo?.h ?? 1,
    frame: MAP_FRAME,
  });
  const { zoomToBox, reset } = pz;
  const fitView = useCallback(() => {
    setGlide(true);
    if (fitBox) zoomToBox(fitBox, 0, FIT_PADDING);
    else reset();
  }, [fitBox, zoomToBox, reset]);

  // Picking a region (or the country) frames it, before the map paints.
  const fitKey = geo ? (sel ?? "") : null;
  const [fittedFor, setFittedFor] = useState<string | null>(null);
  if (fitKey !== fittedFor) {
    setFittedFor(fitKey);
    if (geo) fitView();
  }

  useEffect(() => {
    let live = true;
    void loadCampaignGeo(props.countryId).then((g) => {
      if (live) setGeo(g);
    });
    return () => {
      live = false;
    };
  }, [props.countryId]);

  // Races of the chosen type and stage, by region (search and region ignored:
  // the map always shows the whole picture).
  const byRegion = useMemo(() => {
    const out = new Map<string, CmRace[]>();
    for (const r of filterRaces(races, { ...filter, regionId: "ALL", query: "" })) {
      const list = out.get(r.regionId) ?? [];
      list.push(r);
      out.set(r.regionId, list);
    }
    return out;
  }, [races, filter]);

  // Regions where the viewer's party has a candidate in a race of this view.
  const partyRegions = useMemo(() => {
    const mine = new Set<string>();
    for (const r of races) for (const c of r.candidates) if (c.isYou) mine.add(c.partyId);
    const out = new Set<string>();
    if (mine.size === 0) return out;
    for (const [region, list] of byRegion) {
      if (list.some((r) => r.candidates.some((c) => mine.has(c.partyId)))) out.add(region);
    }
    return out;
  }, [races, byRegion]);

  // Regions in the picked region's frame load their sub-units. Panning and
  // zooming do not widen that, so a drag never fans out into more reads.
  const fitted: MapView = useMemo(
    () =>
      geo && fitBox
        ? viewForBox(fitBox, geo.w, geo.h, MAP_FRAME, FIT_PADDING)
        : { k: 1, x: 0, y: 0 },
    [geo, fitBox]
  );

  const visible = useMemo(
    () => (geo && sel ? visibleRegions(geo.regions, fitted, geo.w, geo.h) : []),
    [geo, sel, fitted]
  );

  // The race whose results draw a region's sub-units: the selected race in its
  // own region, else that region's first race of the chosen type and stage.
  const requests = useMemo<RegionUnitRequest[]>(() => {
    const out: RegionUnitRequest[] = [];
    for (const region of visible) {
      const race =
        selectedRace && selectedRace.regionId === region ? selectedRace : byRegion.get(region)?.[0];
      const source = race ? countySourceFor(race) : null;
      if (race && source) out.push({ regionId: region, electionId: race.electionId, source });
    }
    return out;
  }, [visible, selectedRace, byRegion]);
  const unitData = useRegionUnits(requests, props.turn ?? 0);
  // US sub-units are not in the static asset: their shapes load on their own so
  // a race draws its counties before it has results to colour them.
  const shapeData = useRegionShapes(
    props.countryId,
    filter.type,
    visible,
    geo?.unitSource === "results"
  );

  const rowsByRegion = useMemo(() => {
    const out: Record<string, Map<string, UnitRow>> = {};
    for (const [region, data] of Object.entries(unitData)) {
      if (data) out[region] = new Map(unitRowsFrom(data, ground).map((r) => [r.id, r]));
    }
    return out;
  }, [unitData, ground]);

  if (geo === undefined) {
    return <MapFrameBox>{t("map.loading")}</MapFrameBox>;
  }
  if (geo === null) {
    return <MapFrameBox>{t("map.unavailable")}</MapFrameBox>;
  }

  const type = typeLabel(filter.type, props.countryId);
  const regionLabel = (id: string) => filter.regionNames[id] ?? geo.regions[id]?.n ?? id;
  const regionShade = (id: string) => {
    const fill = regionFill(byRegion.get(id) ?? []);
    return fill ? shadeColorForTier(fill.color, fill.tier, ground) : BLEND.track;
  };

  // Sub-units of a region: static shapes joined to results by id, or (US) the
  // results' own shapes, already in this frame.
  const unitsOf = (region: string) => {
    const rows = rowsByRegion[region];
    if (geo.unitSource === "static") {
      return (geo.units?.[region] ?? []).map((u) => ({
        id: u.id,
        name: u.n,
        d: u.d,
        row: rows?.get(u.id),
      }));
    }
    const served = shapeData[region]?.subdivisions;
    if (served)
      return served.map((u) => ({ id: u.id, name: u.name, d: u.path, row: rows?.get(u.id) }));
    return [...(rows?.values() ?? [])].map((r) => ({ id: r.id, name: r.name, d: r.path, row: r }));
  };

  const selData = sel ? unitData[sel] : null;
  // A finished race that counted nothing has no sub-unit results to draw.
  const noCount =
    selectedRace?.stage === "final" &&
    selectedRace.regionId === sel &&
    countySourceFor(selectedRace) === null;
  const unitCount = sel ? unitsOf(sel).length : 0;
  const picked =
    unitPick && unitPick.region === sel
      ? unitsOf(sel).find((u) => u.id === unitPick.id)
      : undefined;
  const legendLines = (selectedRace ? partyLines(selectedRace) : []).slice(0, 6);
  const view = pz.view;
  const atFit =
    Math.abs(view.k - fitted.k) < 1e-6 &&
    Math.abs(view.x - fitted.x) < 1e-6 &&
    Math.abs(view.y - fitted.y) < 1e-6;
  const toScreen = (x: number, y: number) => ({
    left: `${((x * view.k + view.x) / geo.w) * 100}%`,
    top: `${((y * view.k + view.y) / geo.h) * 100}%`,
  });
  const labelled = sel
    ? visible
    : Object.keys(geo.regions).filter((id) => {
        const [x0, y0, x1, y1] = geo.regions[id].bb;
        return (
          !geo.labelMin ||
          ((x1 - x0) * view.k > geo.labelMin[0] && (y1 - y0) * view.k > geo.labelMin[1])
        );
      });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <nav
        aria-label="Map location"
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}
      >
        <button
          type="button"
          onClick={() => props.onSelectRegion("ALL")}
          style={{
            minHeight: 32,
            padding: "0 6px",
            border: 0,
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            fontFamily: FONT.sans,
            fontSize: 14,
            color: sel ? BLEND.accentInk : BLEND.ink,
            fontWeight: sel ? 500 : 700,
          }}
        >
          {props.countryName}
        </button>
        {sel ? (
          <>
            <span aria-hidden="true" style={{ color: BLEND.mutedDim }}>
              ›
            </span>
            <span style={{ fontWeight: 700 }}>{regionLabel(sel)}</span>
            {unitCount > 0 ? (
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: BLEND.muted }}>
                {t("map.units", {
                  count: unitCount,
                  label: selData?.unitLabelPlural ?? shapeData[sel]?.unitLabelPlural ?? "",
                }).trim()}
              </span>
            ) : null}
          </>
        ) : null}
        {partyRegions.size > 0 ? (
          <button
            type="button"
            aria-pressed={partyOverlay}
            onClick={() => setPartyOverlay((v) => !v)}
            style={{
              marginLeft: "auto",
              minHeight: 32,
              padding: "0 10px",
              borderRadius: 6,
              border: `1px solid ${BLEND.hairlineStrong}`,
              background: partyOverlay ? BLEND.accent : "transparent",
              color: partyOverlay ? "#fff" : BLEND.ink,
              cursor: "pointer",
              fontFamily: FONT.sans,
              fontSize: 13,
            }}
          >
            {t("map.myParty")}
          </button>
        ) : null}
      </nav>

      <div
        ref={measure}
        style={{
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          background: BLEND.inset,
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${geo.w} ${geo.h}`}
          width="100%"
          role="group"
          aria-label={t("map.aria", { place: sel ? regionLabel(sel) : props.countryName, type })}
          onPointerDownCapture={() => setGlide(false)}
          onWheel={() => setGlide(false)}
          onPointerDown={pz.handlers.onPointerDown}
          onPointerMove={pz.handlers.onPointerMove}
          onPointerUp={pz.handlers.onPointerUp}
          onPointerCancel={pz.handlers.onPointerCancel}
          // The click that ends a drag is not a pick.
          onClickCapture={(e) => {
            if (pz.consumeDrag()) e.stopPropagation();
          }}
          style={{
            display: "block",
            // Touch gestures move the map, not the page, as on the country maps.
            touchAction: "none",
            overscrollBehavior: "contain",
            cursor: pz.dragging ? "grabbing" : "grab",
            userSelect: "none",
          }}
        >
          <g
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              transformOrigin: "0 0",
              transition: glide ? "transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)" : "none",
            }}
          >
            {geo.frame ? (
              <path
                d={geo.frame}
                fill="none"
                stroke={BLEND.hairlineStrong}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {Object.entries(geo.regions).map(([id, r]) => {
              const isSel = id === sel;
              const isNb = !!sel && geo.regions[sel]?.nb.includes(id);
              const count = byRegion.get(id)?.length ?? 0;
              const fill = !sel
                ? regionShade(id)
                : isSel
                  ? BLEND.field
                  : isNb
                    ? regionShade(id)
                    : BLEND.track;
              const contested = partyOverlay && partyRegions.has(id);
              const dimmed = partyOverlay && !contested;
              const opacity = (!sel || isSel ? 1 : isNb ? 0.28 : 0.18) * (dimmed ? 0.35 : 1);
              const title =
                sel && !isSel
                  ? t("map.moveHere", { name: regionLabel(id) })
                  : t("map.regionTitle", { name: regionLabel(id), count });
              return (
                <path
                  key={id}
                  d={r.d}
                  role="button"
                  tabIndex={0}
                  aria-label={title}
                  fill={fill}
                  opacity={opacity}
                  stroke={contested ? BLEND.accent : BLEND.page}
                  strokeWidth={contested ? 2 : 0.8}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: isSel ? "default" : "pointer" }}
                  onClick={() => {
                    if (!isSel) {
                      setUnitPick(null);
                      props.onSelectRegion(id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !isSel) {
                      e.preventDefault();
                      props.onSelectRegion(id);
                    }
                  }}
                >
                  <title>{title}</title>
                </path>
              );
            })}
            {sel ? (
              <g transform={`translate(0 ${geo.unitOffsetY})`}>
                {visible.map((region) => {
                  const own = region === sel;
                  const isNb = geo.regions[sel]?.nb.includes(region);
                  return (
                    <g key={region} opacity={own ? 1 : isNb ? NEIGHBOUR_OPACITY : FAR_OPACITY}>
                      {unitsOf(region).map((u) => {
                        const on = own && picked?.id === u.id;
                        const label = u.row
                          ? t("map.unitTitle", { name: u.name, tier: t(`tier.${u.row.tier}`) })
                          : u.name;
                        return (
                          <path
                            key={u.id}
                            d={u.d}
                            role={own ? "button" : undefined}
                            aria-label={own ? label : undefined}
                            tabIndex={own ? 0 : undefined}
                            fill={u.row?.fill ?? BLEND.track}
                            stroke={on ? BLEND.caution : BLEND.page}
                            strokeWidth={on ? 2.5 : 0.5}
                            vectorEffect="non-scaling-stroke"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              if (own) setUnitPick(on ? null : { region, id: u.id });
                              else props.onSelectRegion(region);
                            }}
                            onKeyDown={(e) => {
                              if (own && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault();
                                setUnitPick(on ? null : { region, id: u.id });
                              }
                            }}
                          >
                            <title>
                              {own ? label : t("map.moveHere", { name: regionLabel(region) })}
                            </title>
                          </path>
                        );
                      })}
                    </g>
                  );
                })}
                <path
                  d={geo.regions[sel]?.d}
                  fill="none"
                  stroke={BLEND.ink}
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  transform={`translate(0 ${-geo.unitOffsetY})`}
                />
              </g>
            ) : null}
          </g>
        </svg>
        {labelled.map((id) => {
          const [x0, y0, x1, y1] = geo.regions[id].bb;
          const pos = toScreen((x0 + x1) / 2, (y0 + y1) / 2);
          return (
            <span
              key={id}
              aria-hidden="true"
              style={{
                position: "absolute",
                ...pos,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                fontFamily: FONT.sans,
                fontWeight: 600,
                fontSize: sel ? 12 : 10.5,
                color: sel && id !== sel ? BLEND.muted : BLEND.ink,
                textShadow: "0 1px 3px #000, 0 0 2px #000",
              }}
            >
              {sel ? regionLabel(id) : id}
            </span>
          );
        })}
        <ZoomControls
          canZoomIn={view.k < (MAP_FRAME.maxZoom ?? 1)}
          canZoomOut={view.k > MIN_ZOOM}
          canReset={!atFit}
          onZoom={(direction) => {
            setGlide(true);
            pz.zoomBy(direction);
          }}
          onReset={fitView}
        />
        {picked ? (
          <CountyCard
            name={picked.name}
            row={picked.row}
            race={selectedRace}
            canCanvass={
              !!selectedRace?.isMine &&
              selectedRace.stage !== "final" &&
              selectedRace.regionId === sel
            }
            onCanvass={props.onCanvass}
            onClose={() => setUnitPick(null)}
          />
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <MapLegend lines={legendLines} ground={ground} />
        <span style={{ display: "flex", flexWrap: "wrap", gap: "0 6px", fontSize: 12 }}>
          <span style={{ color: BLEND.muted }}>
            {sel && noCount
              ? t("map.noCountyResults")
              : sel
                ? t("map.hintRegion")
                : t("map.hintNational", { noun: props.regionNoun.toLowerCase() })}
          </span>
          <span style={{ color: BLEND.mutedDim }}>{t("map.hintGestures")}</span>
        </span>
      </div>
    </section>
  );
}

function ZoomControls({
  canZoomIn,
  canZoomOut,
  canReset,
  onZoom,
  onReset,
}: {
  canZoomIn: boolean;
  canZoomOut: boolean;
  canReset: boolean;
  onZoom: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  const t = useTranslations("elections.campaignManager.map");
  const buttons: Array<{ label: string; glyph: string; on: boolean; act: () => void }> = [
    { label: t("zoomIn"), glyph: "+", on: canZoomIn, act: () => onZoom(1) },
    { label: t("zoomOut"), glyph: "\u2212", on: canZoomOut, act: () => onZoom(-1) },
    { label: t("resetView"), glyph: "\u21BA", on: canReset, act: onReset },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        bottom: 10,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${BLEND.hairlineStrong}`,
        background: BLEND.rail,
      }}
    >
      {buttons.map((b, i) => (
        <button
          key={b.label}
          type="button"
          aria-label={b.label}
          title={b.label}
          disabled={!b.on}
          onClick={b.act}
          style={{
            width: 32,
            height: 32,
            border: 0,
            borderTop: i > 0 ? `1px solid ${BLEND.hairline}` : 0,
            background: "transparent",
            color: b.on ? BLEND.ink : BLEND.mutedDim,
            cursor: b.on ? "pointer" : "default",
            fontFamily: FONT.sans,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {b.glyph}
        </button>
      ))}
    </div>
  );
}

function MapFrameBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        minHeight: 220,
        display: "grid",
        placeItems: "center",
        borderRadius: 12,
        background: BLEND.inset,
        color: BLEND.muted,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function MapLegend({
  lines,
  ground,
}: {
  lines: Array<{ partyId: string; partyName: string; partyAbbr: string; partyColor: string }>;
  ground: string;
}) {
  const t = useTranslations("elections.campaignManager.map");
  if (lines.length === 0) return null;
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 14px",
      }}
    >
      {lines.map((l) => (
        <li
          key={l.partyId}
          title={t("legendTitle", { party: l.partyName })}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          <span style={{ display: "flex", gap: 2 }}>
            {TIERS.map((tier) => (
              <span
                key={tier}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: shadeColorForTier(l.partyColor, tier, ground),
                }}
              />
            ))}
          </span>
          {l.partyAbbr}
        </li>
      ))}
    </ul>
  );
}

function CountyCard({
  name,
  row,
  race,
  canCanvass,
  onCanvass,
  onClose,
}: {
  name: string;
  row: UnitRow | undefined;
  race: CmRace | null;
  canCanvass: boolean;
  onCanvass?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("elections.campaignManager");
  const abbrOf = new Map((race ? partyLines(race) : []).map((l) => [l.partyId, l.partyAbbr]));
  const leader = row ? (abbrOf.get(row.leaderPartyId) ?? row.shares[0]?.name ?? "") : "";
  const tier = row ? t(`tier.${row.tier}`) : "";
  const call = !row
    ? null
    : row.baselineLeader
      ? row.baselineLeader.toUpperCase() === leader.toUpperCase()
        ? t("map.callHold", { leader, tier })
        : t("map.callGain", { leader, holder: row.baselineLeader.toUpperCase(), tier })
      : t("map.call", { leader, tier });
  return (
    <div
      role="dialog"
      aria-label={name}
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        width: 250,
        maxWidth: "calc(100% - 24px)",
        padding: 12,
        borderRadius: 12,
        background: BLEND.rail,
        border: `1px solid ${BLEND.hairlineStrong}`,
        boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 14 }}>{name}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.close")}
          style={{ border: 0, background: "transparent", color: BLEND.muted, cursor: "pointer" }}
        >
          ×
        </button>
      </div>
      {row && call ? (
        <>
          <span style={ratingChipStyle(row.fill, row.ink)}>{call}</span>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {row.shares.slice(0, 6).map((s) => (
              <li
                key={s.name}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}
                  />
                  {s.name}
                </span>
                <span style={{ fontFamily: FONT.mono }}>{s.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: BLEND.muted }}>{t("map.noResults")}</p>
      )}
      {canCanvass && onCanvass ? (
        <button
          type="button"
          onClick={onCanvass}
          style={{
            minHeight: 34,
            borderRadius: 8,
            border: 0,
            background: BLEND.accent,
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("map.canvass")}
        </button>
      ) : null}
    </div>
  );
}
