interface YAxisGridProps {
  /** Tick values, bottom to top; the first and fifth lines draw solid. */
  values: number[];
  toY: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
}

/** Horizontal grid lines with right-aligned value labels for the portfolio charts. */
export function YAxisGrid({ values, toY, left, right, format }: YAxisGridProps) {
  return (
    <>
      {values.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line
              x1={left}
              y1={y}
              x2={right}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray={i === 0 || i === 4 ? undefined : "4 3"}
              className="text-card-border/60"
              opacity={0.4}
            />
            <text x={left - 4} y={y + 4} textAnchor="end" fontSize={9} className="fill-muted/70">
              {format(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}
