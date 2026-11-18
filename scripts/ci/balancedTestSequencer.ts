import { relative } from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import durations from "./test-duration-weights.json";

const DEFAULT_TEST_MS = 35;
const FILE_SETUP_MS = 250;
const testDurations: Readonly<Record<string, number>> = durations;

export function balanceTestFiles<T>(
  files: readonly T[],
  count: number,
  pathFor: (file: T) => string,
  durationFor: (path: string) => number
): T[][] {
  const weighted = files
    .map((file) => {
      const path = pathFor(file);
      return { file, path, weight: durationFor(path) };
    })
    .sort((a, b) => b.weight - a.weight || (a.path < b.path ? -1 : Number(a.path > b.path)));
  const shards = Array.from({ length: count }, () => ({ weight: 0, files: [] as T[] }));
  for (const entry of weighted) {
    const lightest = shards.reduce((best, shard) => (shard.weight < best.weight ? shard : best));
    lightest.files.push(entry.file);
    lightest.weight += entry.weight;
  }
  return shards.map((shard) => shard.files);
}

export class BalancedTestSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;
    return balanceTestFiles(
      files,
      shard.count,
      (file) => relative(root, file.moduleId).replaceAll("\\", "/"),
      (path) => FILE_SETUP_MS + (testDurations[path] ?? DEFAULT_TEST_MS)
    )[shard.index - 1];
  }
}
