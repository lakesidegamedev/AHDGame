"use client";

import { useCallback, useEffect, useState } from "react";
import { BLEND, FONT, BLEND_LABEL } from "@/components/blend/tokens";
import { apiErrorText } from "@/lib/errors/catalog";
import { formatCurrency } from "@/lib/utils/formatters";
import { trackAction } from "@/lib/observability/actionBreadcrumb";
import type { FieldOfficeView } from "@/lib/campaigns/fieldOffices/queries";
import { formatPct } from "@/app/elections/[id]/blend/presMap/fieldOfficeMath";

export interface FieldOfficesSectionProps {
  campaignId: string;
  /** Called after an open or close so the war chest and actions refresh. */
  onChanged: () => void;
  variant?: "desktop" | "mobile";
  /** Region to open first (`?region=OH` on the campaign page). */
  initialRegion?: string | null;
  /**
   * The presidential map is on this page (the race page's Campaign mode). The
   * county map lives there; this section points at it.
   */
  mapOnPage?: boolean;
  /** Where the county map is when it is not on this page (the embedded frame). */
  mapHref?: string;
  /** Changes when the campaign's offices change elsewhere on the page (the map). */
  reloadKey?: number;
}

const BUTTON: React.CSSProperties = {
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

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={BLEND_LABEL}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontFamily: FONT.mono,
          fontSize: 20,
          color: tone ?? BLEND.ink,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StrengthBar({ strength }: { strength: number }) {
  return (
    <span
      aria-label={`${Math.round(strength * 100)}% strength`}
      style={{
        display: "inline-block",
        width: 64,
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

/**
 * Field offices: where the campaign has people on the ground.
 *
 * The summary, the totals, the list of current offices and how it works. In
 * county-scope countries the county map itself is the presidential map (colour
 * it by Field offices), so this section points there instead of drawing a
 * second map. Every figure comes from the server view, so the panel never
 * quotes a price or an effect the engine does not use.
 */
export function FieldOfficesSection({
  campaignId,
  onChanged,
  variant = "desktop",
  initialRegion = null,
  mapOnPage = false,
  mapHref,
  reloadKey = 0,
}: FieldOfficesSectionProps) {
  const mobile = variant === "mobile";
  const [region, setRegion] = useState<string | null>(initialRegion);
  const [view, setView] = useState<FieldOfficeView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = region ? `?region=${encodeURIComponent(region)}` : "";
      const res = await fetch(`/api/campaigns/${campaignId}/field-offices${qs}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(apiErrorText(data, "Could not load field offices."));
        return;
      }
      setLoadError(null);
      setView(data.fieldOffices as FieldOfficeView);
    } catch {
      setLoadError("Network error");
    }
  }, [campaignId, region]);

  useEffect(() => {
    void load();
    // reloadKey: an office was opened or closed from the map.
  }, [load, reloadKey]);

  if (loadError && !view) {
    return (
      <Shell mobile={mobile}>
        <p style={{ color: BLEND.negative, fontFamily: FONT.sans, fontSize: 14 }}>{loadError}</p>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell mobile={mobile}>
        <p style={{ color: BLEND.mutedDim, fontFamily: FONT.mono, fontSize: 11 }}>Loading...</p>
      </Shell>
    );
  }
  if (!view.enabled) return null;

  const selectedRegion = view.regions.find((r) => r.id === view.selectedRegionId) ?? null;
  const canAct = view.canManage && view.raceActive;
  const currency = view.costs?.currency ?? "USD";

  const act = async (key: string, run: () => Promise<Response>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await run();
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: success });
        await load();
        onChanged();
      } else {
        setMessage({ ok: false, text: apiErrorText(data, "That did not work.") });
      }
    } catch {
      setMessage({ ok: false, text: "Network error" });
    } finally {
      setBusy(null);
    }
  };

  const closeOffice = (officeId: string, label: string) => {
    trackAction("campaign.field-office.close", { officeId });
    return act(
      `close:${officeId}`,
      () => fetch(`/api/campaigns/${campaignId}/field-offices/${officeId}`, { method: "DELETE" }),
      `Closed the ${label} office.`
    );
  };

  const upkeepTotal = (view.costs?.upkeep ?? 0) * view.offices.length;

  return (
    <Shell mobile={mobile}>
      <h2
        style={{
          margin: "0 0 4px",
          fontFamily: FONT.sans,
          fontSize: mobile ? 20 : 23,
          fontWeight: 600,
        }}
      >
        Field offices
      </h2>
      <p
        style={{
          margin: "0 0 18px",
          fontFamily: FONT.sans,
          fontSize: 14.5,
          lineHeight: 1.55,
          color: BLEND.muted,
          maxWidth: 680,
        }}
      >
        {`Put staff in a county and your voters there turn out in bigger numbers. Every office also lifts turnout across its state, with diminishing returns. Offices reach full strength over ${view.rampTurns} turns, so early ground counts.`}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: 16,
          paddingBottom: 18,
          borderBottom: `1px solid ${BLEND.hairline}`,
        }}
      >
        <Figure label="Offices" value={`${view.offices.length}/${view.cap}`} />
        {view.costs ? (
          <Figure
            label="Upkeep per turn"
            value={formatCurrency(upkeepTotal, currency)}
            tone={upkeepTotal > 0 ? BLEND.caution : undefined}
          />
        ) : null}
        {view.costs ? (
          <Figure label="New office" value={formatCurrency(view.costs.open, currency)} />
        ) : null}
        {selectedRegion ? (
          <Figure
            label={`Turnout boost, ${selectedRegion.name}`}
            value={formatPct(selectedRegion.effectPct)}
            tone={selectedRegion.effectPct > 0 ? BLEND.positive : BLEND.muted}
          />
        ) : null}
      </div>

      {view.regions.length > 1 ? (
        <RegionPicker regions={view.regions} value={view.selectedRegionId} onChange={setRegion} />
      ) : null}

      {view.map || view.offices.length > 0 ? (
        <div style={{ marginTop: 18, maxWidth: 680 }}>
          {view.map ? (
            <MapPointer mapOnPage={mapOnPage} mapHref={mapHref} canManage={view.canManage} />
          ) : null}
          <OfficeList
            view={view}
            canAct={canAct}
            busy={busy}
            onClose={closeOffice}
            onFocus={(regionId) => {
              if (regionId !== view.selectedRegionId) setRegion(regionId);
            }}
          />
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          style={{
            marginTop: 14,
            fontFamily: FONT.mono,
            fontSize: 11,
            color: message.ok ? BLEND.positive : BLEND.negative,
          }}
        >
          {message.text}
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({ mobile, children }: { mobile: boolean; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: mobile ? "18px 16px" : "24px 26px",
        borderBottom: mobile ? undefined : `1px solid ${BLEND.hairlineStrong}`,
      }}
    >
      {children}
    </section>
  );
}

function RegionPicker({
  regions,
  value,
  onChange,
}: {
  regions: FieldOfficeView["regions"];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const active = regions.filter((r) => r.officeCount > 0);
  return (
    <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <label style={BLEND_LABEL} htmlFor="field-office-region">
        State
      </label>
      <select
        id="field-office-region"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: BLEND.field,
          color: BLEND.ink,
          border: `1px solid ${BLEND.chipBorder}`,
          padding: "6px 10px",
          fontFamily: FONT.sans,
          fontSize: 13,
        }}
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.officeCount > 0 ? ` (${r.officeCount})` : ""}
          </option>
        ))}
      </select>
      {active.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r.id)}
          style={{
            ...BUTTON,
            padding: "4px 9px",
            fontSize: 9.5,
            borderColor: r.id === value ? BLEND.hairlineStrong : BLEND.chipBorder,
            background: r.id === value ? BLEND.inset : "transparent",
          }}
        >
          {r.id} {r.officeCount} · {formatPct(r.effectPct, 1)}
        </button>
      ))}
    </div>
  );
}

function MapPointer({
  mapOnPage,
  mapHref,
  canManage,
}: {
  mapOnPage: boolean;
  mapHref?: string;
  canManage: boolean;
}) {
  const copy = mapOnPage
    ? canManage
      ? "The county map is the presidential map above. Colour it by Field offices: lean, or by opportunity to see where a new office adds the most turnout. Open a state, then pick a county to see what an office there is worth and to open one."
      : "Colour the presidential map above by Field offices: lean to see where this campaign has offices."
    : "The county map is on the race page, in Campaign mode.";
  const linkStyle: React.CSSProperties = {
    ...BUTTON,
    display: "inline-block",
    textDecoration: "none",
    marginTop: 10,
  };
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontFamily: FONT.sans,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: BLEND.muted,
        }}
      >
        {copy}
      </p>
      {mapOnPage ? (
        <button
          type="button"
          style={linkStyle}
          onClick={() =>
            document
              .querySelector('[data-testid="campaign-map"]')
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          Go to the map
        </button>
      ) : mapHref ? (
        <a href={mapHref} target="_top" style={linkStyle}>
          Open the map
        </a>
      ) : null}
    </div>
  );
}

function OfficeList({
  view,
  canAct,
  busy,
  onClose,
  onFocus,
}: {
  view: FieldOfficeView;
  canAct: boolean;
  busy: string | null;
  onClose: (officeId: string, label: string) => void;
  onFocus: (regionId: string, subdivisionId: string | null) => void;
}) {
  if (view.offices.length === 0) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ ...BLEND_LABEL, marginBottom: 6 }}>Your offices</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {view.offices.map((o) => (
          <li
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 0",
              borderTop: `1px solid ${BLEND.hairline}`,
              fontFamily: FONT.mono,
              fontSize: 12,
            }}
          >
            <button
              type="button"
              onClick={() => onFocus(o.regionId, o.subdivisionId)}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                background: "transparent",
                border: 0,
                padding: 0,
                color: BLEND.ink,
                fontFamily: FONT.sans,
                fontSize: 13.5,
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {o.label}
              <span style={{ color: BLEND.mutedDim, fontFamily: FONT.mono, fontSize: 11 }}>
                {" "}
                {o.regionId}
              </span>
            </button>
            <StrengthBar strength={o.strength} />
            {canAct ? (
              <button
                type="button"
                onClick={() => onClose(o.id, o.label)}
                disabled={busy !== null}
                aria-label={`Close the ${o.label} office`}
                style={{ ...BUTTON, padding: "3px 8px", fontSize: 9.5, color: BLEND.mutedDim }}
              >
                {busy === `close:${o.id}` ? "..." : "Close"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
