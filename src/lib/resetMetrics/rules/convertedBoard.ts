import type { ResetMetricSnapshot } from "./snapshot";

/** Repair only the identifiable legacy transfer defects, without changing values or history. */
export function normalizeConvertedMetricBoard(board: ResetMetricSnapshot): ResetMetricSnapshot {
  if (board.scope !== "regional") return board;
  let changed = false;
  const observations = Object.fromEntries(
    Object.entries(board.observations).map(([id, original]) => {
      let row = original;
      if (
        (board.countryId === "SCO" || board.countryId === "WAL") &&
        board.sourceTurn > 1 &&
        row.lastUpdatedTurn !== undefined &&
        row.lastUpdatedTurn < board.sourceTurn
      ) {
        row = {
          ...row,
          observedAtTurn: row.observedAtTurn ?? row.lastUpdatedTurn,
          lastUpdatedTurn: board.sourceTurn,
        };
      }
      if (
        board.countryId === "IE" &&
        board.regionId === "NIR" &&
        row.countryBasis?.countryId === "UK"
      ) {
        row = {
          ...row,
          status: "proxy",
          source: "Inherited regional rate at reunification; awaiting Irish owner measurement",
          note: `${row.note} Inherited from the UK; not certified against Ireland's household coverage.`,
        };
        delete row.countryBasis;
        delete row.definitionVersion;
      }
      changed ||= row !== original;
      return [id, row];
    })
  );
  return changed ? { ...board, observations } : board;
}
