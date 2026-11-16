import React from "react";
import { SectionLabel } from "@/components/ui";
import type { ChamberResult } from "@/lib/wiki/chamberElectionResult";
import { arcSeats, formatSignedInt, formatSwing } from "@/lib/wiki/rules/electionResults";
import { formatPct } from "../wikiElectionHelpers";

const VIEW_W = 220;
const VIEW_H = 124;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = 114;
const RADIUS = 104;

function changeClass(n: number | null): string {
  if (n == null || n === 0) return "text-muted";
  return n > 0 ? "text-success" : "text-error";
}

/** Seat arc: one dot per seat in party colours, with the majority line. */
export function SeatArc({ chamber }: { chamber: ChamberResult }) {
  const { seats } = arcSeats(chamber.parties, chamber.totalSeats);
  const summary = chamber.parties
    .filter((p) => p.seats > 0)
    .map((p) => `${p.name} ${p.seats}`)
    .join(", ");
  return (
    <figure className="mb-6">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`${chamber.chamberLabel} seats: ${summary}. ${chamber.majority} seats make a majority.`}
        className="mx-auto w-full max-w-xl"
      >
        {seats.map((seat, i) => (
          <circle
            key={i}
            cx={CENTER_X + seat.x * RADIUS}
            cy={CENTER_Y + seat.y * RADIUS}
            r={seat.r * RADIUS}
            fill={seat.color}
          />
        ))}
        <line
          x1={CENTER_X}
          x2={CENTER_X}
          y1={CENTER_Y - RADIUS - 4}
          y2={CENTER_Y - RADIUS * 0.45}
          stroke="currentColor"
          strokeWidth={0.6}
          strokeDasharray="2 2"
          className="text-muted"
        />
        <text
          x={CENTER_X}
          y={CENTER_Y - 8}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={14}
          fontWeight={700}
        >
          {chamber.totalSeats}
        </text>
        <text x={CENTER_X} y={CENTER_Y + 2} textAnchor="middle" className="fill-muted" fontSize={5}>
          {chamber.majority} for a majority
        </text>
      </svg>
    </figure>
  );
}

export function ChamberResultsSection({ chamber }: { chamber: ChamberResult }) {
  const hasPrevious = chamber.previous != null;
  const showVotes = chamber.totalVotes > 0;
  const visible = chamber.parties.filter((p) => p.seats > 0 || p.votes > 0);
  const gov = chamber.government;

  return (
    <section className="mb-10 ">
      <SectionLabel as="h3">{chamber.chamberLabel} result</SectionLabel>
      <p className="mb-4 text-sm text-muted">
        {chamber.totalSeats} seats across {chamber.regionCount} regions.
        {showVotes ? ` ${chamber.totalVotes.toLocaleString("en-US")} votes cast.` : ""}
        {hasPrevious ? ` Changes are against the ${chamber.previous?.label}.` : ""}
      </p>

      <SeatArc chamber={chamber} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-xs uppercase text-muted">
              <th className="border-b border-card-border py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                Party
              </th>
              {showVotes && (
                <th className="border-b border-card-border py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Votes
                </th>
              )}
              {showVotes && (
                <th className="border-b border-card-border py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Vote share
                </th>
              )}
              <th className="border-b border-card-border py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                Seats
              </th>
              {hasPrevious && (
                <th className="border-b border-card-border py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Change
                </th>
              )}
              {hasPrevious && showVotes && (
                <th className="border-b border-card-border py-1.5 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Swing (pts)
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.partyId} className="border-b border-card-border/50">
                <td className="border-b border-card-border/60 py-2 pr-3">
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm align-middle"
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  />
                  <span className="font-medium text-foreground">{p.name}</span>
                  {p.abbreviation && <span className="ml-1 text-muted">({p.abbreviation})</span>}
                </td>
                {showVotes && (
                  <td className="border-b border-card-border/60 py-2 pr-3 text-right tabular-nums text-muted">
                    {p.votes.toLocaleString("en-US")}
                  </td>
                )}
                {showVotes && (
                  <td className="border-b border-card-border/60 py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-card-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, p.votePct ?? 0)}%`,
                            backgroundColor: p.color,
                          }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-muted">
                        {p.votePct == null ? "" : formatPct(p.votePct)}
                      </span>
                    </div>
                  </td>
                )}
                <td className="border-b border-card-border/60 py-2 pr-3 text-right tabular-nums font-semibold text-foreground">
                  {p.seats}
                </td>
                {hasPrevious && (
                  <td
                    className={`border-b border-card-border/60 py-2 pr-3 text-right tabular-nums ${changeClass(p.seatChange)}`}
                  >
                    {formatSignedInt(p.seatChange)}
                  </td>
                )}
                {hasPrevious && showVotes && (
                  <td
                    className={`border-b border-card-border/60 py-2 text-right tabular-nums ${changeClass(p.swing)}`}
                  >
                    {formatSwing(p.swing)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gov && gov.governingPartyName && (
        <div className="mt-5 border-b border-card-border/60 py-2.5 text-sm">
          <h4 className="mb-1 font-semibold text-foreground">Government formed</h4>
          <p className="text-muted">
            {gov.governingPartyName}
            {gov.coalitionPartyNames.length > 0
              ? ` with ${gov.coalitionPartyNames.join(", ")}`
              : ""}{" "}
            formed the government
            {gov.primeMinisterName ? `, led by ${gov.primeMinisterName}` : ""}, backed by{" "}
            {gov.seatsSupporting} of {chamber.totalSeats} seats
            {gov.isMinority ? " as a minority government" : ""}.
          </p>
        </div>
      )}
    </section>
  );
}
