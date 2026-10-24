import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { createSourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import {
  MigrationCoordinatorError,
  createMigrationCoordinatorClient,
  loadMigrationCoordinatorConfig,
} from "@/lib/auth/migrationCoordinator";
import { MigrationStartError, migrateSourceAccount } from "@/lib/auth/migrationStart";
import { migrationRoutesEnabled, migrationSourceIssuer } from "@/lib/auth/migrationConfig";
import { getClientIp } from "@/lib/utils/network";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_SCHEMA = z
  .object({
    identifier: z.string().min(1).max(320),
    password: z.string().min(1).max(1024),
    provenance: z.string().min(1).max(256).optional(),
  })
  .strict();
const HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache" };

function failure(status: number, code: string) {
  return errorResponse(status, code, { code, headers: HEADERS });
}

/**
 * Source-side migration start. It verifies fresh password ownership, reserves
 * the coordinator identifiers, and admits the exact operation. It is disabled
 * unless AHD_MIGRATION_START_ENABLED=true.
 *
 * This route does not provision a target, write a source fence, import a
 * credential, activate a target or issue a unified session. A separate trusted
 * ceremony must complete those steps; until then the account remains legacy.
 */
export async function POST(request: Request) {
  if (!migrationRoutesEnabled("AHD_MIGRATION_START_ENABLED")) {
    return failure(404, "not_found");
  }
  const clientIp = await getClientIp();
  const ipLimit = checkRateLimit(`migration-start-ip:${clientIp}`, 30, 15 * 60_000);
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfter, undefined, ipLimit);
  const parsed = await parseJsonBody(request, BODY_SCHEMA, { maxBytes: 2048 });
  if (!parsed.success) return failure(parsed.status, "invalid_request");

  const key = createHash("sha256")
    .update(`${clientIp}:${parsed.data.identifier.trim().toLowerCase()}`)
    .digest("hex");
  const limit = checkRateLimit(`migration-start:${key}`, 5, 15 * 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter, undefined, limit);

  try {
    const sourceIssuer = migrationSourceIssuer();
    const [client, db] = await Promise.all([getMongoClient(), getDb()]);
    const proofStore = createSourceOwnershipProofStore({
      sourceIssuer,
      client,
      db,
    });
    const coordinator = createMigrationCoordinatorClient(loadMigrationCoordinatorConfig());
    const result = await migrateSourceAccount({
      db,
      proofStore,
      coordinator,
      sourceIssuer,
      request: parsed.data,
    });
    return NextResponse.json(result, { status: 202, headers: HEADERS });
  } catch (error) {
    if (error instanceof MigrationStartError) return failure(error.status, error.code);
    if (error instanceof MigrationCoordinatorError) return failure(error.status, error.code);
    if (error instanceof Error && error.name === "SourceOwnershipProofOutcomeUnknownError") {
      return failure(503, "migration_unavailable");
    }
    if (error instanceof Error && error.name === "SourceOwnershipProofError") {
      return failure(401, "invalid_credentials");
    }
    return failure(503, "migration_unavailable");
  }
}
