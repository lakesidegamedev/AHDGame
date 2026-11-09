"use client";

import { BLEND, FONT } from "@/components/blend/tokens";
import type { CountyRow } from "./countyModel";
import {
  formatPct,
  leanFill,
  leanLabel,
  pathCentre,
  pinRadius,
  valueFill,
  type FieldOfficeViewId,
} from "./fieldOfficeMath";
import { COUNTY_OFFSET_Y } from "./usStatesGeo";

/**
 * Pins on the counties that hold one of the campaign's offices, and an
 * outline on the county picked for its detail. Drawn in the county layer's own
 * frame so both sit exactly on the county shapes; neither takes the pointer.
 */
export function FieldOfficeOverlay({
  rows,
  viewBox,
  selected,
}: {
  rows: CountyRow[];
  /** The county file's view box; sizes the pins so a small state reads like a big one. */
  viewBox: string;
  selected: string | null;
}) {
  const r = pinRadius(viewBox);
  const pins = rows
    .filter((row) => row.field?.officeId)
    .map((row) => ({ id: row.id, c: pathCentre(row.path) }))
    .filter((p): p is { id: string; c: { x: number; y: number } } => p.c !== null);
  const picked = selected ? rows.find((row) => row.id === selected) : undefined;
  return (
    <g transform={`translate(0 ${COUNTY_OFFSET_Y})`} pointerEvents="none">
      {picked ? (
        <path
          d={picked.path}
          fill="none"
          style={{ stroke: BLEND.ink }}
          strokeWidth={2.2}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {pins.map((p) => (
        <g key={`pin-${p.id}`} data-testid="field-office-pin">
          <circle cx={p.c.x} cy={p.c.y} r={r * 1.6} fill={BLEND.gold} opacity={0.25} />
          <circle
            cx={p.c.x}
            cy={p.c.y}
            r={r * 0.8}
            fill={BLEND.gold}
            stroke={BLEND.page}
            strokeWidth={r * 0.25}
          />
        </g>
      ))}
    </g>
  );
}

/** Hover readout for a county in a field-office view. */
export function FieldOfficeTip({
  county,
  stateId,
  x,
  y,
  frameWidth,
}: {
  county: CountyRow;
  stateId: string;
  x: number;
  y: number;
  frameWidth: number;
}) {
  const info = county.field;
  if (!info) return null;
  const flip = x > frameWidth - 230;
  return (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        left: flip ? x - 14 : x + 14,
        top: Math.max(4, y - 10),
        transform: flip ? "translateX(-100%)" : undefined,
        pointerEvents: "none",
        zIndex: 5,
        padding: "8px 10px",
        minWidth: 180,
        background: BLEND.page,
        border: `1px solid ${BLEND.hairlineStrong}`,
        boxShadow: "0 6px 18px rgba(0,0,0,.5)",
        fontSize: 12.5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontWeight: 600 }}>
        <span>{county.name}</span>
        <span style={{ fontFamily: FONT.mono, fontWeight: 500, color: BLEND.muted }}>
          {stateId}
        </span>
      </div>
      <div style={{ marginTop: 4, fontFamily: FONT.mono, fontSize: 11, color: BLEND.muted }}>
        {leanLabel(info.livePvi)}
        {info.officeId ? " · office open" : ""}
      </div>
      {info.marginalPct != null && !info.officeId ? (
        <div style={{ marginTop: 2, fontFamily: FONT.mono, fontSize: 11, color: BLEND.positive }}>
          New office {formatPct(info.marginalPct)} turnout
        </div>
      ) : null}
    </div>
  );
}

/** Colour key for the field-office views. */
export function FieldOfficeKey({
  view,
  note,
}: {
  view: FieldOfficeViewId;
  /** Where the county lean comes from, in words. */
  note?: string | null;
}) {
  const lean = view === "fieldLean";
  const stops = lean
    ? [-30, -15, -5, 0, 5, 15, 30].map((v) => ({ key: String(v), fill: leanFill(v) }))
    : [0.1, 0.3, 0.5, 0.75, 1].map((v) => ({ key: String(v), fill: valueFill(v, 1) }));
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 12px",
        fontFamily: FONT.mono,
        fontSize: 10,
        color: BLEND.mutedDim,
      }}
    >
      <span style={{ letterSpacing: ".1em" }}>
        {lean ? "COUNTY LEAN:" : "VALUE OF A NEW OFFICE:"}
      </span>
      <span>{lean ? "Left" : "Low"}</span>
      <span style={{ display: "flex", gap: 2 }}>
        {stops.map((s) => (
          <span key={s.key} style={{ width: 18, height: 8, borderRadius: 2, background: s.fill }} />
        ))}
      </span>
      <span>{lean ? "Right" : "High"}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: BLEND.gold,
            display: "inline-block",
          }}
        />
        Office
      </span>
      <span>Gold states hold offices. Open a state and zoom in for its counties.</span>
      {lean && note ? <span>{note}</span> : null}
    </div>
  );
}
