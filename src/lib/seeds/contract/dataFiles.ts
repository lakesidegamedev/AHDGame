/**
 * Generated seed tables kept as data files, each checked against its schema.
 * A value out of range or a missing country stops every preset from seeding,
 * because these files are read for every world.
 */

import type { z } from "zod";
import { compositionWeightsSchema } from "@/lib/demographics/compositionWeightsSchema";
import { COMPOSITION_WEIGHTS } from "@/lib/demographics/compositionWeights";
import { nonPlayableBoardsSchema } from "@/lib/politicalMetrics/seeds/nonPlayableBoardsSchema";
import { getNonPlayableBoards } from "@/lib/politicalMetrics/seeds/nonPlayableBoards";
import type { SeedContractGap } from "./seedContractError";

const MAX_ISSUES_PER_FILE = 5;

export interface SeedDataFile {
  readonly id: string;
  readonly schema: z.ZodType;
  readonly load: () => unknown;
}

export const SEED_DATA_FILES: readonly SeedDataFile[] = [
  {
    id: "data:non-playable-boards",
    schema: nonPlayableBoardsSchema,
    load: getNonPlayableBoards,
  },
  {
    id: "data:composition-weights",
    schema: compositionWeightsSchema,
    load: () => COMPOSITION_WEIGHTS,
  },
];

/** Schema findings for one data file's contents, at most a handful per file. */
export function dataFileGaps(file: SeedDataFile, contents: unknown): SeedContractGap[] {
  const result = file.schema.safeParse(contents);
  if (result.success) return [];
  return result.error.issues.slice(0, MAX_ISSUES_PER_FILE).map((issue) => ({
    dataset: file.id,
    detail: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  }));
}

let cached: SeedContractGap[] | undefined;

/** Every schema finding across the data files, validated once per process. */
export function checkSeedDataFiles(): SeedContractGap[] {
  cached ??= SEED_DATA_FILES.flatMap((file) => dataFileGaps(file, file.load()));
  return cached;
}
