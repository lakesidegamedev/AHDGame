import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getDb } from "@/lib/mongodb";
import { createAdminLog } from "@/lib/adminLog";
import { getElectoratePriorityOverridesCollection } from "@/lib/db/collections/electoratePriorityOverrides";
import type { ElectoratePriorityOverride } from "@/lib/db/types/electoratePriorityOverride";
import {
  priorityTargetSchema,
  priorityUpdateSchema,
} from "@/lib/demographics/legislativePriorities/schema";
import {
  isPriorityTarget,
  resolvePrioritySelection,
} from "@/lib/demographics/legislativePriorities/rules";
import {
  getPriorityEditorData,
  loadPriorityLaws,
  loadPriorityDefaults,
  priorityOverrideId,
} from "@/lib/demographics/legislativePriorities/overrides";

// Auth: requireAdmin for every method, including the law-option picker.
export const GET = withAdminRoute(async (_auth, request: Request) => {
  const parsed = priorityTargetSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) return errorResponse(400, "Invalid priority target.");
  const target = parsed.data;
  if (!isPriorityTarget(target.countryId, target.regionId, target.bucketId))
    return errorResponse(400, "Unknown electorate group or region.");
  return NextResponse.json(await getPriorityEditorData(await getDb(), target));
});

export const PUT = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, priorityUpdateSchema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);
  const { priorities, ...target } = parsed.data;
  if (!isPriorityTarget(target.countryId, target.regionId, target.bucketId))
    return errorResponse(400, "Unknown electorate group or region.");
  const db = await getDb();
  const laws = await loadPriorityLaws(db, target.countryId);
  const resolved = resolvePrioritySelection(
    target.countryId,
    priorities,
    new Map(laws.map((law) => [law._id, law]))
  );
  if (!resolved)
    return errorResponse(
      400,
      "Choose four different laws and an existing policy level for each, from this country."
    );
  const collection = await getElectoratePriorityOverridesCollection(db);
  const id = priorityOverrideId(target);
  const document: ElectoratePriorityOverride = {
    _id: id,
    ...target,
    priorities,
    updatedAt: new Date(),
    updatedBy: auth.admin.username,
  };
  await collection.replaceOne({ _id: id }, document, { upsert: true });
  await createAdminLog({
    category: "system",
    action: "demographics_updated",
    username: auth.admin.username,
    adminUsername: auth.admin.username,
    details: `Updated legislative priorities for ${id}`,
  });
  return NextResponse.json({ priorities: resolved, isOverride: true });
});

export const DELETE = withAdminRoute(async (auth, request: Request) => {
  const parsed = await parseJsonBody(request, priorityTargetSchema);
  if (!parsed.success) return errorResponse(parsed.status, parsed.error);
  const target = parsed.data;
  if (!isPriorityTarget(target.countryId, target.regionId, target.bucketId))
    return errorResponse(400, "Unknown electorate group or region.");
  const db = await getDb();
  const [collection, defaults] = await Promise.all([
    getElectoratePriorityOverridesCollection(db),
    loadPriorityDefaults(db, target),
  ]);
  const id = priorityOverrideId(target);
  await collection.deleteOne({ _id: id });
  await createAdminLog({
    category: "system",
    action: "demographics_updated",
    username: auth.admin.username,
    adminUsername: auth.admin.username,
    details: `Restored default legislative priorities for ${id}`,
  });
  return NextResponse.json({
    priorities: defaults,
    isOverride: false,
  });
});
