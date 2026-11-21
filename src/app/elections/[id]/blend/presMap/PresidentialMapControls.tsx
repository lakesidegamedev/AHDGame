"use client";

import { BLEND, BLEND_LABEL, FONT } from "@/components/blend/tokens";

import {
  MOMENTUM_FULL_PP,
  SHARE_RAMP,
  PRESENCE_FULL_LEVEL,
  mixToward,
  shareCandidates,
  shareStrength,
  type MapDataView,
} from "@/app/elections/[id]/blend/presMap/dataViews";
import type { PresMapCandidate } from "@/app/elections/[id]/blend/presMap/presMapModel";

import { type PresMapModel } from "@/app/elections/[id]/blend/presMap/presMapModel";

export function ControlButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 34,
        height: 34,
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        font: "inherit",
        fontFamily: FONT.mono,
        fontSize: 16,
        lineHeight: 1,
        color: active ? BLEND.accentInk : BLEND.ink,
        background: active ? "rgba(220,38,38,.16)" : BLEND.rail,
        border: `1px solid ${active ? BLEND.accent : BLEND.hairlineStrong}`,
      }}
    >
      {children}
    </button>
  );
}

export function MapControls({
  stage,
  unlocked,
  canZoomIn,
  canZoomOut,
  atRest,
  onToggle,
  onZoom,
  onReset,
}: {
  stage: boolean;
  unlocked: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  atRest: boolean;
  onToggle: () => void;
  onZoom: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: stage ? 36 : 8,
        left: stage ? 14 : 8,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {stage ? null : (
        <ControlButton
          label={unlocked ? "Lock map (page scrolling resumes)" : "Unlock map to pan and zoom"}
          onClick={onToggle}
          active={unlocked}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <rect x="3" y="7" width="10" height="7" />
            {unlocked ? <path d="M5 7V5a3 3 0 0 1 5.6-1.5" /> : <path d="M5 7V5a3 3 0 0 1 6 0v2" />}
          </svg>
        </ControlButton>
      )}
      {stage || unlocked ? (
        <>
          <ControlButton label="Zoom in" onClick={() => onZoom(1)} disabled={!canZoomIn}>
            +
          </ControlButton>
          <ControlButton label="Zoom out" onClick={() => onZoom(-1)} disabled={!canZoomOut}>
            &minus;
          </ControlButton>
          <ControlButton label="Reset view" onClick={onReset} disabled={atRest}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M3 8a5 5 0 1 0 1.8-3.8M3 2v3h3" />
            </svg>
          </ControlButton>
        </>
      ) : null}
    </div>
  );
}

export const chipStyle = (on: boolean): React.CSSProperties => ({
  padding: "4px 10px",
  cursor: "pointer",
  font: "inherit",
  fontFamily: FONT.mono,
  fontSize: 10.5,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  border: `1px solid ${on ? BLEND.ink : BLEND.hairlineStrong}`,
  color: on ? BLEND.ink : BLEND.muted,
  background: on ? BLEND.hairlineStrong : "transparent",
});

export /** What the map is coloured by, and for the share view, whose share. */
function DataViewPicker({
  options,
  view,
  onView,
  candidates,
  shareCand,
  onShareCand,
}: {
  options: { id: MapDataView; label: string }[];
  view: MapDataView;
  onView: (v: MapDataView) => void;
  candidates: PresMapCandidate[];
  shareCand: PresMapCandidate | null;
  onShareCand: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ ...BLEND_LABEL, marginRight: 4 }}>Colour by</span>
      <div
        role="radiogroup"
        aria-label="Colour the map by"
        style={{ display: "inline-flex", gap: 4 }}
      >
        {options.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={view === v.id}
            onClick={() => onView(v.id)}
            style={chipStyle(view === v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "share" && candidates.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Whose vote share"
          style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, marginLeft: 8 }}
        >
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={shareCand?.id === c.id}
              onClick={() => onShareCand(c.id)}
              style={{ ...chipStyle(shareCand?.id === c.id), textTransform: "none" }}
            >
              <i
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  marginRight: 6,
                  background: c.color,
                }}
              />
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export /** Colour key for the non-margin views. */
function DataViewKey({
  view,
  model,
  shareCand,
  ground,
  presenceColor,
}: {
  view: MapDataView;
  model: PresMapModel;
  shareCand: PresMapCandidate | null;
  ground: string;
  presenceColor: string | null;
}) {
  const keyStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px 16px",
    fontFamily: FONT.mono,
    fontSize: 10,
    color: BLEND.mutedDim,
  };
  const swatch = (bg: string) => (
    <i aria-hidden style={{ width: 9, height: 9, display: "block", background: bg }} />
  );
  if (view === "presence" && presenceColor) {
    return (
      <div style={keyStyle}>
        <span style={{ letterSpacing: ".1em" }}>YOUR CAMPAIGN PRESENCE:</span>
        {[0, 2, 5, 10].map((lvl) => (
          <span key={lvl} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {swatch(
              mixToward(
                ground,
                presenceColor,
                lvl > 0 ? 0.2 + 0.8 * Math.min(1, lvl / PRESENCE_FULL_LEVEL) : 0.06
              )
            )}
            {lvl === 10 ? "level 10+" : `level ${lvl}`}
          </span>
        ))}
      </div>
    );
  }
  if (view === "winner") {
    return (
      <div style={keyStyle}>
        <span style={{ letterSpacing: ".1em" }}>LEADING IN EACH STATE:</span>
        {shareCandidates(model).map((c) => (
          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {swatch(c.color)}
            {c.name}
          </span>
        ))}
      </div>
    );
  }
  if (view === "share" && shareCand) {
    const stops = [SHARE_RAMP.lo, 35, 50, SHARE_RAMP.hi];
    return (
      <div style={keyStyle}>
        <span style={{ letterSpacing: ".1em" }}>{shareCand.name.toUpperCase()} VOTE SHARE:</span>
        {stops.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {swatch(mixToward(ground, shareCand.color, shareStrength(p)))}
            {p === SHARE_RAMP.lo
              ? `${p}% or less`
              : p === SHARE_RAMP.hi
                ? `${p}% or more`
                : `${p}%`}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div style={keyStyle}>
      <span style={{ letterSpacing: ".1em" }}>MOMENTUM, LAST FEW TURNS:</span>
      {shareCandidates(model)
        .slice(0, 2)
        .map((c) => (
          <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {swatch(mixToward(ground, c.color, 0.4))}
            {swatch(c.color)}
            toward {c.name} (up to {MOMENTUM_FULL_PP}pp)
          </span>
        ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {swatch(mixToward(ground, "#8f8f9d", 0.22))}
        steady
      </span>
    </div>
  );
}
