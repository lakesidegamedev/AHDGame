"use client";

import { useState } from "react";

/** Unified color-coded pie chart for general election vote share on cards. */
export function GeneralPieChart({
  slices,
  size = 72,
}: {
  slices: { pct: number; color: string; label: string }[];
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (slices.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  if (slices.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
      </svg>
    );
  }

  // Pre-compute paths outside of JSX to avoid mutating cursor during render
  const paths: { d: string; color: string; label: string; pct: number }[] = [];
  let cursor = -Math.PI / 2;
  for (const s of slices) {
    const angle = (s.pct / 100) * 2 * Math.PI;
    if (angle <= 0) continue;
    const x1 = cx + r * Math.cos(cursor);
    const y1 = cy + r * Math.sin(cursor);
    cursor += angle;
    const x2 = cx + r * Math.cos(cursor);
    const y2 = cy + r * Math.sin(cursor);
    const large = angle > Math.PI ? 1 : 0;
    paths.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color: s.color,
      label: s.label,
      pct: s.pct,
    });
  }

  const h = hovered !== null ? paths[hovered] : null;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rounded-full overflow-visible"
      >
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.color}
            stroke="var(--card)"
            strokeWidth={hovered === i ? 1 : 0.5}
            style={{
              opacity: hovered === null || hovered === i ? 1 : 0.4,
              transform: hovered === i ? `scale(1.06)` : `scale(1)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: `opacity 0.12s ease, transform 0.12s ease`,
              cursor: "pointer",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      {h && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-8 pointer-events-none z-50 whitespace-nowrap rounded border border-card-border bg-card px-2 py-0.5 text-[10px] font-medium shadow"
          style={{ color: h.color }}
        >
          {h.label} · {h.pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
