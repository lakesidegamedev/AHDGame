/**
 * POST /api/admin/retention
 *
 * Runs the history-retention pipeline (archive to R2, then delete/downsample).
 * Admin-only.
 *
 * dryRun defaults to TRUE and performs no writes, returning only the manifest
 * of what WOULD happen.
 *
 * Execution (dryRun=false) is refused unless env RETENTION_ENABLED === "1",
 * so the endpoint is safe to expose.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { runRetention } from "@/lib/retention/retention";
import { runtimeConfig } from "@/lib/config/runtime";

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(true),
  collections: z.array(z.string()).optional(),
  compact: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    // Empty or absent body is valid and means dry-run defaults; a present-but-malformed body is rejected.
    let text = "";
    try {
      text = await request.text();
    } catch {
      text = "";
    }
    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        return errorResponse(400, "Invalid JSON body");
      }
    }
    const parsedBody = bodySchema.safeParse(raw);
    if (!parsedBody.success) {
      return errorResponse(400, parsedBody.error.issues[0]?.message ?? "Invalid body");
    }
    const { dryRun, collections, compact } = parsedBody.data;

    if (!dryRun && !runtimeConfig.retentionEnabled()) {
      return errorResponse(
        403,
        "Retention execution is disabled. Set RETENTION_ENABLED=1 to run for real."
      );
    }

    const summary = await runRetention({ dryRun, collections, compact });
    return NextResponse.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
