import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NonPlayableBoards } from "./nonPlayableBoardsSchema";

/**
 * Starting political boards for non-playable countries, keyed preset, country,
 * region, family. The table is generated data in
 * `src/data/political-metrics/non-playable-boards.json`; no generator for it is
 * committed, so edits are made to the data file and checked by the seed contract.
 *
 * Read from disk on first use and cached, so the 1.5 MB table stays out of the
 * module graph. Server only: never import this from a client component.
 */
let cached: NonPlayableBoards | undefined;

export function getNonPlayableBoards(): NonPlayableBoards {
  cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src/data/political-metrics/non-playable-boards.json"), "utf8")
  ) as NonPlayableBoards;
  return cached;
}
