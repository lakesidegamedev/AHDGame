import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { createSourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import {
  migrationProofLoadSecret,
  migrationRoutesEnabled,
  migrationSourceIssuer,
} from "@/lib/auth/migrationConfig";
import { getClientIp } from "@/lib/utils/network";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BODY_SCHEMA = z.object({ proofId: z.string().regex(UUID_V4) }).strict();
const AUTH_SCHEMA = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/u;
const HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache" };

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const match = AUTH_SCHEMA.exec(header);
  if (!match || match[1].length < 32 || match[1].length > 512) return false;
  const presented = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(presented, expected);
}

/**
 * Private source-side proof load route used by the coordinator's authenticated
 * proof reader. This is not a browser route. It returns one durable proof
 * wrapper or 404; it does not issue, consume, admit or fence anything.
 *
 * The route is disabled unless AHD_MIGRATION_PROOF_LOAD_ENABLED=true and
 * requires the exact AHD_MIGRATION_PROOF_LOAD_SECRET bearer credential.
 */
export async function POST(request: Request) {
  if (!migrationRoutesEnabled("AHD_MIGRATION_PROOF_LOAD_ENABLED")) {
    return errorResponse(404, "Not found", { headers: HEADERS });
  }
  if (
    request.headers.get("origin") ||
    request.headers.get("cookie") ||
    request.headers.get("sec-fetch-site")
  ) {
    return errorResponse(403, "Forbidden", { headers: HEADERS });
  }
  const clientIp = await getClientIp();
  const limit = checkRateLimit(`migration-proof-load:${clientIp}`, 600, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter, undefined, limit);

  let secret: string;
  try {
    secret = migrationProofLoadSecret();
  } catch {
    return errorResponse(503, "Proof load unavailable", { headers: HEADERS });
  }
  if (!authorized(request, secret)) {
    return errorResponse(401, "Authentication required", { headers: HEADERS });
  }

  const parsed = await parseJsonBody(request, BODY_SCHEMA, { maxBytes: 1024 });
  if (!parsed.success) {
    return errorResponse(parsed.status, parsed.error, { headers: HEADERS });
  }

  try {
    const [client, db] = await Promise.all([getMongoClient(), getDb()]);
    const store = createSourceOwnershipProofStore({
      sourceIssuer: migrationSourceIssuer(),
      client,
      db,
    });
    const loaded = await store.loadProof({ proofId: parsed.data.proofId });
    if (!loaded) return errorResponse(404, "Not found", { headers: HEADERS });
    return NextResponse.json(
      {
        proof: loaded.proof,
        sourceNowMs: loaded.sourceNowMs,
        expired: loaded.expired,
      },
      { headers: HEADERS }
    );
  } catch {
    return errorResponse(503, "Proof load unavailable", { headers: HEADERS });
  }
}
