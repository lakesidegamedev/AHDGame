"use client";

import { NoticeStrip } from "@/components/corporation/ledger/NoticeStrip";
import { useGameTurnStatus } from "@/hooks/useGameEvents";

/** The turn the page figures are from, when the world has moved past it. */
export function staleFiguresTurn(
  dataTurn: number | null | undefined,
  liveTurn: number | null | undefined
): number | null {
  if (!dataTurn || !liveTurn) return null;
  return dataTurn < liveTurn ? dataTurn : null;
}

/** Labels figures that predate the latest turn while the page refreshes. */
export function StaleTurnNotice({ dataTurn }: { dataTurn: number | null | undefined }) {
  const status = useGameTurnStatus();
  const staleTurn = staleFiguresTurn(dataTurn, status?.currentTurn);
  if (staleTurn == null) return null;
  return (
    <NoticeStrip tone="info" tag="Updating">
      Figures from turn {staleTurn}, updating.
    </NoticeStrip>
  );
}
