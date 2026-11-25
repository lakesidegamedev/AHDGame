import React from "react";
import type { PartySeatHistory as History } from "@/lib/wiki/chamberElectionResult";
import { formatSignedInt } from "@/lib/wiki/rules/electionResults";

const W = 320;
const H = 110;
const PAD = { left: 30, right: 10, top: 10, bottom: 20 };

function SeatLine({ points, color }: { points: History["points"]; color: string }) {
  const maxSeats = Math.max(1, ...points.map((p) => p.seats));
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (seats: number) => H - PAD.bottom - (seats / maxSeats) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.seats)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-md"
      role="img"
      aria-label="Seats over time"
    >
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={H - PAD.bottom}
        y2={H - PAD.bottom}
        stroke="currentColor"
        className="text-card-border"
      />
      <text
        x={PAD.left - 4}
        y={y(maxSeats) + 3}
        textAnchor="end"
        fontSize={8}
        className="fill-muted"
      >
        {maxSeats}
      </text>
      <text
        x={PAD.left - 4}
        y={H - PAD.bottom + 3}
        textAnchor="end"
        fontSize={8}
        className="fill-muted"
      >
        0
      </text>
      {points.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2} />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.seats)} r={3} fill={color} />
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={8} className="fill-muted">
            {p.year ?? ""}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Seats won at each election of each chamber, as a line and a table. */
export function PartySeatHistory({ history, color }: { history: History[]; color: string }) {
  if (history.length === 0) return null;
  return (
    <section className="mb-8 rounded-xl border border-card-border bg-card/60 p-6 shadow-card">
      <h2 className="mb-4 text-heading font-semibold text-foreground">Seat history</h2>
      <div className="space-y-8">
        {history.map((chamber) => (
          <div key={chamber.chamberLabel}>
            <h3 className="mb-2 text-body-lg font-medium text-foreground">
              {chamber.chamberLabel}
            </h3>
            <SeatLine points={chamber.points} color={color} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b border-card-border text-left text-body-sm uppercase text-muted">
                    <th className="py-1 pr-3 font-semibold">Year</th>
                    <th className="py-1 pr-3 font-semibold">Election</th>
                    <th className="py-1 pr-3 text-right font-semibold">Seats</th>
                    <th className="py-1 pr-3 text-right font-semibold">Of</th>
                    <th className="py-1 pr-3 text-right font-semibold">Change</th>
                    <th className="py-1 text-right font-semibold">Vote share</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chamber.points].reverse().map((p, i) => (
                    <tr key={i} className="border-b border-card-border/50">
                      <td className="py-1 pr-3 text-foreground">{p.year ?? ""}</td>
                      <td className="py-1 pr-3 text-muted">
                        {p.electionType.startsWith("snap_") ? "Snap election" : "General election"}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono text-foreground">{p.seats}</td>
                      <td className="py-1 pr-3 text-right font-mono text-muted">{p.totalSeats}</td>
                      <td className="py-1 pr-3 text-right font-mono text-muted">
                        {formatSignedInt(p.seatChange)}
                      </td>
                      <td className="py-1 text-right font-mono text-muted">
                        {p.votePct == null ? "" : `${p.votePct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
