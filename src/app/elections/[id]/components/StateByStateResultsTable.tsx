"use client";

import { useState, useMemo } from "react";
import { computeStateResults } from "./generalElectionHelpers";
import type { CandidateDetail, GeneralVotes } from "./ElectionDetailTypes";
import { formatVotes } from "./ElectionDetailHelpers";

// State-by-State Results Table Component
export function StateByStateResultsTable({
  tally,
  candidates,
  colorMap,
}: {
  tally: GeneralVotes;
  candidates: CandidateDetail[];
  colorMap: Map<string, string>;
}) {
  const [sortBy, setSortBy] = useState<"state" | "ev" | "margin">("ev");
  const [sortDesc, setSortDesc] = useState(true);

  const stateResults = useMemo(
    () => computeStateResults(tally.stateVoteData, tally.evByState, candidates, colorMap),
    [tally.stateVoteData, tally.evByState, candidates, colorMap]
  );

  const sortedResults = useMemo(() => {
    const sorted = [...stateResults];
    sorted.sort((a, b) => {
      let compare = 0;
      if (sortBy === "state") {
        compare = a.stateName.localeCompare(b.stateName);
      } else if (sortBy === "ev") {
        compare = a.ev - b.ev;
      } else if (sortBy === "margin") {
        compare = a.margin - b.margin;
      }
      return sortDesc ? -compare : compare;
    });
    return sorted;
  }, [stateResults, sortBy, sortDesc]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(column);
      setSortDesc(true);
    }
  };

  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <div className="px-5 py-3 bg-card-elevated border-b border-card-border">
        <h3 className="text-lg font-semibold">State-by-state results</h3>
        <p className="text-xs text-muted mt-1">All 50 states + DC · Click column headers to sort</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-background text-left text-sm font-semibold text-foreground">
              <th
                className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("state")}
              >
                <div className="flex items-center gap-1">
                  State
                  {sortBy === "state" && (
                    <span className="text-primary">{sortDesc ? "↓" : "↑"}</span>
                  )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("ev")}
              >
                <div className="flex items-center justify-end gap-1">
                  EV
                  {sortBy === "ev" && <span className="text-primary">{sortDesc ? "↓" : "↑"}</span>}
                </div>
              </th>
              <th className="px-4 py-3">Winner</th>
              <th
                className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort("margin")}
              >
                <div className="flex items-center justify-end gap-1">
                  Margin
                  {sortBy === "margin" && (
                    <span className="text-primary">{sortDesc ? "↓" : "↑"}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-right">Vote share</th>
              <th className="px-4 py-3 text-right">Total votes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {sortedResults.map((result) => (
              <tr key={result.stateId} className="hover:bg-background/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.stateName}</span>
                    <span className="text-xs text-muted">({result.stateId})</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold tabular-nums">{result.ev}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: result.winnerColor }}
                    />
                    <span className="font-semibold" style={{ color: result.winnerColor }}>
                      {result.winnerName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold tabular-nums text-yellow-400">
                    +{result.margin.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: result.winnerColor }}
                  >
                    {result.winnerPct.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted text-xs">
                  {formatVotes(result.totalVotes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
