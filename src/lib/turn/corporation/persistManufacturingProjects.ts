import type { Db } from "mongodb";

import { type ManufacturingProductProject } from "@/lib/products/manufacturingProject";
import { manufacturingProductProjectsV2Collection } from "@/lib/db/repositories/manufacturingProductProjectsV2";

/**
 * Record this turn's NPP manufacturing product projects.
 *
 * One unordered `bulkWrite` instead of one `insertOne` per project. The
 * documents are the same and a project already recorded for the turn is still
 * skipped, as before; only the duplicate-key error surfaces per operation
 * instead of per call, so anything that is not a duplicate still throws.
 */
export async function persistNppManufacturingProjects(
  db: Db,
  projects: readonly ManufacturingProductProject[]
): Promise<void> {
  if (projects.length === 0) return;
  try {
    await manufacturingProductProjectsV2Collection<ManufacturingProductProject>(db).bulkWrite(
      projects.map((project) => ({ insertOne: { document: project } })),
      { ordered: false }
    );
  } catch (error) {
    const writeErrors = (error as { writeErrors?: { code?: number }[] }).writeErrors ?? [];
    const nonDuplicate = writeErrors.filter((failure) => failure.code !== 11000);
    if (nonDuplicate.length > 0 || writeErrors.length === 0) throw error;
  }
}
