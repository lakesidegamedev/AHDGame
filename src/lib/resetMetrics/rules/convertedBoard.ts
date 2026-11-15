import type { ResetMetricSnapshot } from "./snapshot";

/** Successor boards whose rows kept a pre-transfer update turn. */
const RESTAMPED_SUCCESSOR_BOARDS: ReadonlySet<string> = new Set(["SCO", "WAL"]);

/** Regions that joined a country carrying the source country's certified basis. */
const INHERITED_BASIS_REGIONS: readonly { country: string; region: string; from: string }[] = [
  { country: "IE", region: "NIR", from: "UK" },
];

/** Repair only the identifiable legacy transfer defects, without changing values or history. */
export function normalizeConvertedMetricBoard(board: ResetMetricSnapshot): ResetMetricSnapshot {
  if (board.scope !== "regional") return board;
  let changed = false;
  const observations = Object.fromEntries(
    Object.entries(board.observations).map(([id, original]) => {
      let row = original;
      if (
        RESTAMPED_SUCCESSOR_BOARDS.has(board.countryId) &&
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
      const inherited = INHERITED_BASIS_REGIONS.find(
        (entry) =>
          entry.country === board.countryId &&
          entry.region === board.regionId &&
          entry.from === row.countryBasis?.countryId
      );
      if (inherited) {
        row = {
          ...row,
          status: "proxy",
          source: "Inherited regional rate at reunification; awaiting Irish owner measurement",
          note: `${row.note} Inherited from ${inherited.from}; not certified against this country's household coverage.`,
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
