"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { PollingSeries } from "@/lib/campaignManager/rules";

export interface PollingChartLine {
  id: string;
  name: string;
  color: string;
}

/** Drawn at the container's real width and this height, so text stays at its size. */
const H = 200;
const FALLBACK_W = 520;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

/**
 * Each line's share by turn. Hovering a turn shows a tooltip with every line's
 * name, share and (once a general has counted votes) vote total at that turn.
 * `turnLabel` names the x axis: game turns for a general, counts in order for a
 * primary (its snapshots carry no turn number).
 */
export function PollingChart({
  series,
  lines,
  turnLabel,
}: {
  series: PollingSeries;
  lines: PollingChartLine[];
  turnLabel: "turn" | "count";
}) {
  const t = useTranslations("elections.campaignManager.chart");
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(FALLBACK_W);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("empty")}</p>;
  }

  const values = series.flatMap((p) => lines.map((l) => p.shares[l.id]).filter((v) => v != null));
  const max = Math.min(100, Math.ceil((Math.max(...values, 10) + 5) / 10) * 10);
  const min = Math.max(0, Math.floor((Math.min(...values, max) - 5) / 10) * 10);
  const plotW = Math.max(1, W - PAD.l - PAD.r);
  const x = (i: number) =>
    series.length === 1 ? PAD.l + plotW / 2 : PAD.l + (i * plotW) / (series.length - 1);
  const y = (v: number) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / Math.max(1, max - min);
  const label = (p: PollingSeries[number]) => t(turnLabel, { n: p.turn });
  const point = hover != null ? series[hover] : null;
  // Keep the tooltip inside the chart: flip it to the left of the cursor past the middle.
  const tipLeft = hover != null && x(hover) > W / 2;

  return (
    <div ref={boxRef} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("title")}
        style={{ display: "block", maxWidth: "100%" }}
      >
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={BLEND.hairline} />
            <text
              x={PAD.l - 6}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="10"
              fill={BLEND.mutedDim}
              fontFamily={FONT.mono}
            >
              {v}
            </text>
          </g>
        ))}
        {lines.map((l) => {
          const pts = series
            .map((p, i) => (p.shares[l.id] == null ? null : `${x(i)},${y(p.shares[l.id])}`))
            .filter(Boolean);
          return pts.length > 1 ? (
            <polyline
              key={l.id}
              points={pts.join(" ")}
              fill="none"
              stroke={l.color}
              strokeWidth={2}
            />
          ) : null;
        })}
        {hover != null ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke={BLEND.hairlineStrong}
              strokeDasharray="3 3"
            />
            {lines.map((l) => {
              const v = series[hover].shares[l.id];
              return v == null ? null : (
                <circle key={l.id} cx={x(hover)} cy={y(v)} r={3.5} fill={l.color} />
              );
            })}
          </>
        ) : null}
        {series.map((p, i) => (
          <text
            key={p.turn}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill={BLEND.mutedDim}
            fontFamily={FONT.mono}
          >
            {p.turn}
          </text>
        ))}
      </svg>

      {/* Hover targets: one column per turn, keyboard reachable. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: PAD.l,
          width: plotW,
          height: H - PAD.b,
          display: "flex",
        }}
      >
        {series.map((p, i) => (
          <button
            key={p.turn}
            type="button"
            aria-label={label(p)}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{ flex: 1, background: "transparent", border: 0, cursor: "crosshair" }}
          />
        ))}
      </div>

      {point && hover != null ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: PAD.t,
            ...(tipLeft ? { right: W - x(hover) + 10 } : { left: x(hover) + 10 }),
            minWidth: 150,
            padding: "8px 10px",
            borderRadius: 8,
            background: BLEND.rail,
            border: `1px solid ${BLEND.hairlineStrong}`,
            boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
            pointerEvents: "none",
            fontFamily: FONT.mono,
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 2,
          }}
        >
          <span style={{ color: BLEND.muted }}>{label(point)}</span>
          {lines
            .filter((l) => point.shares[l.id] != null)
            .sort((a, b) => point.shares[b.id] - point.shares[a.id])
            .map((l) => (
              <span
                key={l.id}
                style={{ display: "flex", alignItems: "center", gap: 6, color: BLEND.ink }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: l.color,
                    flex: "none",
                  }}
                />
                <span style={{ flex: 1 }}>{l.name}</span>
                <span>{point.shares[l.id].toFixed(1)}%</span>
                {point.votes?.[l.id] != null ? (
                  <span style={{ color: BLEND.muted }}>
                    {t("votes", { count: point.votes[l.id] })}
                  </span>
                ) : null}
              </span>
            ))}
        </div>
      ) : null}

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6, fontSize: 12 }}
      >
        {lines.map((l) => (
          <span
            key={l.id}
            style={{ display: "flex", alignItems: "center", gap: 5, color: BLEND.muted }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: 2, background: l.color }}
            />
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}
