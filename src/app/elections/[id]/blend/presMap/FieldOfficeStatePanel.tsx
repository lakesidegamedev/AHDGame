"use client";

import type { CSSProperties } from "react";
import { BLEND, BLEND_LABEL, FONT } from "@/components/blend/tokens";
import { formatCurrency } from "@/lib/utils/formatters";
import type {
  FieldOfficeSubdivisionDto,
  FieldOfficeView,
} from "@/lib/campaigns/fieldOffices/queries";
import { formatPct, leanLabel, openBlockReason, topOpportunityCounties } from "./fieldOfficeMath";
import type { FieldOfficeLayer } from "./useFieldOfficeLayer";

const BUTTON: CSSProperties = {
  border: `1px solid ${BLEND.chipBorder}`,
  background: "transparent",
  padding: "7px 13px",
  fontFamily: FONT.mono,
  fontSize: 10.5,
  letterSpacing: ".08em",
  fontWeight: 700,
  textTransform: "uppercase",
  color: BLEND.ink,
  cursor: "pointer",
};

function StrengthBar({ strength }: { strength: number }) {
  return (
    <span
      aria-label={`${Math.round(strength * 100)}% strength`}
      style={{
        display: "inline-block",
        width: 56,
        height: 6,
        borderRadius: 3,
        background: BLEND.track,
        overflow: "hidden",
        verticalAlign: "middle",
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${Math.round(strength * 100)}%`,
          background: strength >= 1 ? BLEND.positive : BLEND.caution,
        }}
      />
    </span>
  );
}

/** One county: lean, share of the state, what a new office adds, and the open or close action. */
export function FieldOfficeCountyCard({
  sub,
  view,
  layer,
}: {
  sub: FieldOfficeSubdivisionDto;
  view: FieldOfficeView;
  layer: FieldOfficeLayer;
}) {
  const regionId = view.map?.regionId ?? "";
  const canAct = view.canManage && view.raceActive;
  const currency = view.costs?.currency ?? "USD";
  const blockReason = openBlockReason(view, formatCurrency);
  const openKey = `open:${regionId}:${sub.id}`;
  const { busy } = layer;
  return (
    <div
      data-testid="field-office-county"
      style={{
        marginTop: 12,
        padding: "12px 14px",
        background: BLEND.inset,
        border: `1px solid ${BLEND.hairlineStrong}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 16, fontWeight: 600 }}>
          {sub.name} County
        </div>
        {sub.officeId ? (
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: BLEND.gold }}>
            OFFICE OPEN
          </span>
        ) : null}
      </div>
      <dl
        style={{
          margin: "8px 0 0",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 4,
          columnGap: 14,
          fontFamily: FONT.mono,
          fontSize: 12,
        }}
      >
        <dt style={{ color: BLEND.mutedDim }}>Lean</dt>
        <dd style={{ margin: 0 }}>
          {leanLabel(sub.livePvi)}
          {Math.abs(sub.livePvi - sub.basePvi) >= 0.1 ? (
            <span style={{ color: BLEND.mutedDim }}> (was {leanLabel(sub.basePvi)})</span>
          ) : null}
        </dd>
        <dt style={{ color: BLEND.mutedDim }}>Share of state</dt>
        <dd style={{ margin: 0 }}>{(sub.electorateShare * 100).toFixed(1)}%</dd>
        {sub.yieldFactor != null ? (
          <>
            <dt style={{ color: BLEND.mutedDim }}>Your yield</dt>
            <dd style={{ margin: 0 }}>{sub.yieldFactor.toFixed(2)}x</dd>
          </>
        ) : null}
        {sub.marginalPct != null && !sub.officeId ? (
          <>
            <dt style={{ color: BLEND.mutedDim }}>New office</dt>
            <dd style={{ margin: 0, color: BLEND.positive }}>
              {formatPct(sub.marginalPct)} turnout statewide
            </dd>
          </>
        ) : null}
      </dl>
      {canAct ? (
        <div style={{ marginTop: 12 }}>
          {sub.officeId ? (
            <button
              type="button"
              onClick={() => void layer.closeOffice(sub.officeId!, sub.name)}
              disabled={busy !== null}
              style={{ ...BUTTON, color: BLEND.muted }}
            >
              {busy === `close:${sub.officeId}` ? "Closing..." : "Close office"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void layer.openOffice(regionId, sub.id, `${sub.name} County`)}
                disabled={busy !== null || blockReason !== null}
                style={{
                  ...BUTTON,
                  borderColor: BLEND.accent,
                  background: blockReason ? "transparent" : BLEND.accent,
                  color: blockReason ? BLEND.mutedDim : "#fff",
                  cursor: blockReason ? "not-allowed" : "pointer",
                }}
              >
                {busy === openKey
                  ? "Opening..."
                  : `Open office${view.costs ? ` · ${formatCurrency(view.costs.open, currency)} · ${view.costs.actions} actions` : ""}`}
              </button>
              {blockReason ? (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontFamily: FONT.sans,
                    fontSize: 12.5,
                    color: BLEND.caution,
                  }}
                >
                  {blockReason}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Field offices in the open state, appended to the map's state overview: how
 * many offices the campaign holds there, this campaign's offices with their
 * strength (and Close for those who may), the picked county's detail, and,
 * when the map cannot show counties (locked, or a phone), the best counties
 * for a new office as a list. Everything comes from the server's field-office
 * view for the viewer, so a rival sees offices and lean but no prices.
 */
export function FieldOfficeStatePanel({
  layer,
  stateId,
  stateName,
  active,
  listCounties,
  onShowOnMap,
}: {
  layer: FieldOfficeLayer;
  stateId: string;
  stateName: string;
  /** A field-office view is on the map. */
  active: boolean;
  /** The map sits behind this panel (a phone), so list the best spots here instead. */
  listCounties: boolean;
  onShowOnMap: () => void;
}) {
  const { meta, regionView } = layer;
  if (!meta || !meta.enabled) return null;

  const region = meta.regions.find((r) => r.id === stateId);
  if (!region) return null;
  const view = regionView && regionView.map?.regionId === stateId ? regionView : null;
  const subs = view?.map?.subdivisions ?? [];
  const here = meta.offices.filter((o) => o.regionId === stateId);
  const county = layer.selectedCounty ? subs.find((s) => s.id === layer.selectedCounty) : undefined;
  const top = view && view.canManage && listCounties ? topOpportunityCounties(subs) : [];
  // A manager's own "open a field office" link is in the campaign block above.
  const canAct = (view ?? meta).canManage && (view ?? meta).raceActive;

  return (
    <section
      data-testid="field-office-panel"
      style={{
        marginTop: 16,
        padding: 12,
        border: `1px solid ${BLEND.hairlineStrong}`,
        background: BLEND.inset,
      }}
    >
      <div style={BLEND_LABEL}>Field offices in {stateName}</div>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: BLEND.muted }}>
        {region.officeCount === 0
          ? "No offices here yet."
          : `${region.officeCount} office${region.officeCount === 1 ? "" : "s"}, turnout boost ${formatPct(region.effectPct)}.`}
      </p>

      {here.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
          {here.map((o) => (
            <li
              key={o.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderTop: `1px solid ${BLEND.hairline}`,
                fontSize: 13,
              }}
            >
              <button
                type="button"
                onClick={() => (o.subdivisionId ? layer.selectCounty(o.subdivisionId) : undefined)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  color: BLEND.ink,
                  font: "inherit",
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {o.label}
              </button>
              <StrengthBar strength={o.strength} />
              {canAct ? (
                <button
                  type="button"
                  onClick={() => void layer.closeOffice(o.id, o.label)}
                  disabled={layer.busy !== null}
                  aria-label={`Close the ${o.label} office`}
                  style={{ ...BUTTON, padding: "3px 8px", fontSize: 9.5, color: BLEND.mutedDim }}
                >
                  {layer.busy === `close:${o.id}` ? "..." : "Close"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!active && !listCounties && !meta.canManage ? (
        <button
          type="button"
          onClick={onShowOnMap}
          style={{ ...BUTTON, marginTop: 10, width: "100%" }}
        >
          Show counties on the map
        </button>
      ) : null}

      {(active || listCounties) && !view && !layer.loadError ? (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: BLEND.mutedDim }}>
          Loading counties...
        </p>
      ) : null}

      {county && view ? <FieldOfficeCountyCard sub={county} view={view} layer={layer} /> : null}

      {top.length > 0 && view ? (
        <div data-testid="field-office-top" style={{ marginTop: 12 }}>
          <div style={BLEND_LABEL}>Best counties for a new office</div>
          <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
            {top.map((s) => (
              <li key={s.id} style={{ borderTop: `1px solid ${BLEND.hairline}` }}>
                <button
                  type="button"
                  onClick={() => layer.selectCounty(s.id)}
                  aria-pressed={layer.selectedCounty === s.id}
                  style={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    background: "transparent",
                    border: 0,
                    color: BLEND.ink,
                    font: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ fontFamily: FONT.mono, color: BLEND.positive }}>
                    {formatPct(s.marginalPct ?? 0)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {layer.message ? (
        <p
          role="status"
          style={{
            margin: "8px 0 0",
            fontFamily: FONT.mono,
            fontSize: 11,
            color: layer.message.ok ? BLEND.positive : BLEND.negative,
          }}
        >
          {layer.message.text}
        </p>
      ) : null}
      {layer.loadError ? (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 12.5, color: BLEND.negative }}>
          {layer.loadError}
        </p>
      ) : null}
    </section>
  );
}
