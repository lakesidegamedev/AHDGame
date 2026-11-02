"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BLEND, FONT } from "@/components/blend/tokens";
import type { PollingSeries } from "@/lib/campaignManager/rules";

export interface PollingChartLine {
  id: string;
  name: string;
  color: string;
}

const W = 520;
const H = 190;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

/**
 * Each line's share by turn. Hovering a turn column pins a readout of every
 * line's share at that turn. `turnLabel` names the x axis: game turns for a
 * general, counts in order for a primary (its snapshots carry no turn number).
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

  if (series.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: BLEND.muted }}>{t("empty")}</p>;
  }

  const values = series.flatMap((p) => lines.map((l) => p.shares[l.id]).filter((v) => v != null));
  const max = Math.min(100, Math.ceil((Math.max(...values, 10) + 5) / 10) * 10);
  const min = Math.max(0, Math.floor((Math.min(...values, max) - 5) / 10) * 10);
  const x = (i: number) =>
    series.length === 1
      ? (PAD.l + W - PAD.r) / 2
      : PAD.l + (i * (W - PAD.l - PAD.r)) / (series.length - 1);
  const y = (v: number) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / Math.max(1, max - min);
  const colW = (W - PAD.l - PAD.r) / Math.max(1, series.length);
  const label = (p: PollingSeries[number]) => t(turnLabel, { n: p.turn });
  const shown = hover ?? series.length - 1;

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("title")}>
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
        {lines.map((l) => {
          const v = series[shown].shares[l.id];
          return v == null ? null : (
            <circle key={l.id} cx={x(shown)} cy={y(v)} r={3.5} fill={l.color} />
          );
        })}
        <line
          x1={x(shown)}
          x2={x(shown)}
          y1={PAD.t}
          y2={H - PAD.b}
          stroke={BLEND.hairlineStrong}
          strokeDasharray="3 3"
        />
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
          inset: `0 ${(PAD.r / W) * 100}% ${(PAD.b / H) * 100}% ${(PAD.l / W) * 100}%`,
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
            style={{
              flex: `0 0 ${(colW / (W - PAD.l - PAD.r)) * 100}%`,
              background: "transparent",
              border: 0,
              cursor: "crosshair",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          marginTop: 6,
          fontFamily: FONT.mono,
          fontSize: 12,
        }}
      >
        <span style={{ color: BLEND.muted }}>{label(series[shown])}</span>
        {lines.map((l) => {
          const v = series[shown].shares[l.id];
          return v == null ? null : (
            <span key={l.id} style={{ color: BLEND.ink }}>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: l.color,
                  marginRight: 5,
                }}
              />
              {t("value", { name: l.name, pct: `${v.toFixed(1)}%` })}
            </span>
          );
        })}
      </div>
    </div>
  );
}
