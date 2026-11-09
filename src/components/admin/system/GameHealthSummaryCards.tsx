"use client";

import type { GameHealthSnapshot } from "@/lib/db/types";
import { gameHealthPhaseCounts } from "@/lib/observability/rules/gameHealthPhaseCounts";

interface Props {
  snapshot: GameHealthSnapshot | null;
}

export function GameHealthSummaryCards({ snapshot }: Props) {
  if (!snapshot) {
    return <p className="text-sm text-muted">No health data available yet.</p>;
  }

  const counts = gameHealthPhaseCounts(snapshot);
  const cards = [
    {
      label: "Last turn",
      value: `${snapshot.turnProcessing.durationMs.toLocaleString("en-US")}ms`,
      sub: `Turn ${snapshot.turn}`,
    },
    {
      label: "Warnings",
      value: String(snapshot.turnProcessing.warningCount),
      sub: `Turn ${snapshot.turn}`,
      color: snapshot.turnProcessing.warningCount > 0 ? "text-yellow-500" : "text-green-500",
    },
    {
      label: "Errors",
      value: String(counts.errors),
      sub: `Turn ${snapshot.turn}`,
      color: counts.errors > 0 ? "text-red-500" : "text-green-500",
    },
    {
      label: "Blocked phases",
      value: String(counts.blocked),
      sub: `Turn ${snapshot.turn}`,
      color: counts.blocked > 0 ? "text-orange-500" : "text-green-500",
    },
    {
      label: "Integrity",
      value: snapshot.dataIntegrity ? `${snapshot.dataIntegrity.issues.length} issues` : "Skipped",
      sub: snapshot.dataIntegrity ? `Turn ${snapshot.dataIntegrity.lastCheckTurn}` : "Not checked",
      color:
        snapshot.dataIntegrity && snapshot.dataIntegrity.issues.length > 0
          ? "text-orange-500"
          : "text-green-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card p-3 text-center shadow-sm"
        >
          <p className="text-xs text-muted">{card.label}</p>
          <p className={`text-xl font-bold ${card.color ?? "text-foreground"}`}>{card.value}</p>
          <p className="text-xs text-muted">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
