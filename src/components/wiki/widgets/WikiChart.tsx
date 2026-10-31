"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildWikiChart } from "@/lib/wiki/charts";
import type { WikiChartSpec } from "@/lib/wiki/charts/types";

const SERIES_COLORS = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "var(--gold)",
  "var(--secondary)",
];

type Row = Record<string, number>;

function toRows(spec: WikiChartSpec): Row[] {
  const byX = new Map<number, Row>();
  spec.series.forEach((s, i) => {
    for (const [x, y] of s.points) {
      const row = byX.get(x) ?? { x };
      row[`s${i}`] = y;
      byX.set(x, row);
    }
  });
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

function describe(spec: WikiChartSpec): string {
  const names = spec.series.map((s) => s.name).join(", ");
  const unit = spec.unit ? ` (${spec.unit})` : "";
  return `${spec.title}. ${spec.kind === "bar" ? "Bar" : "Line"} chart of ${spec.yLabel}${unit} against ${spec.xLabel}. Series: ${names}.`;
}

function axisLabel(text: string, unit?: string): string {
  return unit && !text.includes(unit) ? `${text} (${unit})` : text;
}

export function WikiChartView({ spec }: { spec: WikiChartSpec }) {
  const rows = useMemo(() => toRows(spec), [spec]);
  const hasRight = spec.series.some((s) => s.axis === "right");
  const multi = spec.series.length > 1;
  const cats = spec.categories;
  const tickFormatter = cats ? (v: number) => cats[v] ?? String(v) : undefined;
  const common = { data: rows, margin: { top: 8, right: hasRight ? 8 : 16, bottom: 20, left: 8 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
      <XAxis
        dataKey="x"
        type={cats ? "category" : "number"}
        domain={cats ? undefined : ["dataMin", "dataMax"]}
        tickFormatter={tickFormatter}
        tick={{ fontSize: 11, fill: "var(--muted)" }}
        stroke="var(--card-border)"
        label={{
          value: spec.xLabel,
          position: "insideBottom",
          offset: -12,
          style: { fontSize: 11, fill: "var(--muted)" },
        }}
      />
      <YAxis
        yAxisId="left"
        tick={{ fontSize: 11, fill: "var(--muted)" }}
        stroke="var(--card-border)"
        width={56}
        label={{
          value: axisLabel(spec.yLabel, spec.unit),
          angle: -90,
          position: "insideLeft",
          style: { fontSize: 11, fill: "var(--muted)", textAnchor: "middle" },
        }}
      />
      {hasRight && (
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          stroke="var(--card-border)"
          width={56}
          label={{
            value: axisLabel(spec.y2Label ?? "", spec.y2Unit),
            angle: 90,
            position: "insideRight",
            style: { fontSize: 11, fill: "var(--muted)", textAnchor: "middle" },
          }}
        />
      )}
      <Tooltip
        contentStyle={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 6,
          fontSize: 12,
        }}
        labelStyle={{ color: "var(--foreground)" }}
        labelFormatter={(v) => `${spec.xLabel}: ${cats ? (cats[Number(v)] ?? v) : v}`}
        formatter={(value, name, item) => {
          const right = spec.series.find((_, i) => `s${i}` === item?.dataKey)?.axis === "right";
          const unit = right ? spec.y2Unit : spec.unit;
          return [`${value}${unit ? ` ${unit}` : ""}`, name];
        }}
      />
      {multi && <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />}
      {(spec.markers ?? []).map((m) => (
        <ReferenceLine
          key={`${m.x ?? ""}-${m.y ?? ""}-${m.label}`}
          yAxisId="left"
          x={m.x}
          y={m.y}
          stroke="var(--muted)"
          strokeDasharray="4 4"
          label={{ value: m.label, fontSize: 10, fill: "var(--muted)", position: "insideTopRight" }}
        />
      ))}
    </>
  );

  return (
    <figure className="my-6 rounded-lg border border-card-border bg-card/40 p-4">
      <figcaption className="mb-3 text-sm font-semibold text-foreground">{spec.title}</figcaption>
      <div role="img" aria-label={describe(spec)} className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {spec.kind === "bar" ? (
            <BarChart {...common}>
              {axes}
              {spec.series.map((s, i) => (
                <Bar
                  key={s.name}
                  dataKey={`s${i}`}
                  name={s.name}
                  yAxisId={s.axis ?? "left"}
                  stackId={spec.stacked ? "a" : undefined}
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart {...common}>
              {axes}
              {spec.series.map((s, i) => (
                <Line
                  key={s.name}
                  dataKey={`s${i}`}
                  name={s.name}
                  yAxisId={s.axis ?? "left"}
                  type={spec.kind === "step" ? "stepAfter" : "monotone"}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {spec.caption && <p className="mt-2 text-xs text-muted">{spec.caption}</p>}
    </figure>
  );
}

/** Wiki widget: the fence body is a chart id from the WIKI_CHARTS registry. */
export function WikiChart({ data }: { data?: string }) {
  const spec = useMemo(() => (data ? buildWikiChart(data.trim()) : null), [data]);
  if (!spec) return null;
  return <WikiChartView spec={spec} />;
}
