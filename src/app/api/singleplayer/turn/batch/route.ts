import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { getDb } from "@/lib/mongodb";
import { parseJsonBody } from "@/lib/api/validate";
import {
  BATCH_TURN_CHOICES,
  getLatestSingleplayerBatch,
  requestSingleplayerBatchStop,
  startSingleplayerBatch,
} from "@/lib/singleplayerBatch";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const bodySchema = z.object({
  turns: z
    .number()
    .int()
    .min(1)
    .max(Math.max(...BATCH_TURN_CHOICES)),
});

/**
 * Start playing several normal turns in the background. Answers at once; the
 * client polls GET for progress, the stop reason and the digest.
 */
export async function POST(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);
    const started = await startSingleplayerBatch(await getDb(), parsed.data.turns);
    if (!started.ok) return errorResponse(started.status, started.error);
    return NextResponse.json(
      { success: true, batch: started.job },
      { status: 202, headers: NO_STORE }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Progress of the running batch, or the result of the last one. */
export async function GET(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  return NextResponse.json({ batch: getLatestSingleplayerBatch() }, { headers: NO_STORE });
}

/** Stop after the turn that is running now. */
export async function DELETE(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  const job = requestSingleplayerBatchStop();
  if (!job) return errorResponse(409, "No multi-turn advance is running.");
  return NextResponse.json({ success: true, batch: job }, { headers: NO_STORE });
}
