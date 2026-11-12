import { NextResponse } from "next/server";
import * as v8 from "v8";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseHeapSnapshotJson } from "@/lib/observability/heapWatchdog";

/*
 * POST /api/admin/debug/heap-snapshot
 *
 * Captures a V8 heap snapshot, parses it, returns top-N constructors by
 * total self_size. Companion to the allocation profile endpoint (which shows
 * allocations over a window); diff two captures to find leaks.
 *
 * Snapshotting transiently uses ~2x peak memory; fine at current heap size but
 * not safe on the pre-OOM watchdog path, so it is manual-invocation only.
 *
 * Auth: requireAdmin
 * Errors: 403
 */

const DEFAULT_TOP_N = 25;
const MAX_TOP_N = 100;

interface HeapSnapshotResponse {
  capturedAt: string;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  topNFormatted: string;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const topNParam = url.searchParams.get("topN");
    const topN = topNParam ? Number(topNParam) : DEFAULT_TOP_N;
    if (!Number.isFinite(topN) || topN < 1 || topN > MAX_TOP_N) {
      return errorResponse(400, `topN must be between 1 and ${MAX_TOP_N}`);
    }

    const memBefore = process.memoryUsage();
    const capturedAt = new Date();

    // Snapshot path under os tmpdir; cleaned up in the finally block.
    const filename = path.join(os.tmpdir(), `heap-${Date.now()}-${process.pid}.heapsnapshot`);
    let topNFormatted = "(snapshot unavailable)";
    try {
      v8.writeHeapSnapshot(filename);
      const raw = fs.readFileSync(filename, "utf8");
      const snap = JSON.parse(raw) as unknown;
      topNFormatted = parseHeapSnapshotJson(snap, topN);
    } finally {
      try {
        fs.unlinkSync(filename);
      } catch {
        // Best effort — tmp gets cleaned up eventually.
      }
    }

    const response: HeapSnapshotResponse = {
      capturedAt: capturedAt.toISOString(),
      heapUsedMb: Math.round(memBefore.heapUsed / 1_000_000),
      heapTotalMb: Math.round(memBefore.heapTotal / 1_000_000),
      rssMb: Math.round(memBefore.rss / 1_000_000),
      topNFormatted,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error);
  }
}
