import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { z } from "zod";
import type { Achievement } from "@/lib/db/types";
import { listAchievementsWithEarnedCounts } from "@/lib/achievements/earnedCounts";
import { invalidateDefinitionsCache } from "@/lib/achievements/cache";

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Slug must be lowercase alphanumeric with underscores"),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  icon: z.string().max(10),
  category: z.enum(["milestone", "election", "legislation", "social", "action", "special"]),
  order: z.number().int().min(0).optional(),
});

// GET /api/admin/achievements — Lists all achievements with how many characters have earned each one.
// Auth: requireAdmin
// Errors: 403
export const GET = withAdminAuth(async () => {
  try {
    const list = await listAchievementsWithEarnedCounts();
    return NextResponse.json({ achievements: list });
  } catch (error) {
    return handleRouteError(error);
  }
});

// POST /api/admin/achievements — Creates a new manual-only achievement definition.
// Auth: requireAdmin
// Errors: 400, 403, 409
export const POST = withAdminAuth(async (_auth, request: Request) => {
  try {
    const parsed = await parseJsonBody(request, createSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const { slug, name, description, icon, category, order } = parsed.data;
    const db = await getDb();

    const existing = await db.collection<Achievement>("achievements").findOne({ slug });
    if (existing) {
      return errorResponse(409, "Achievement with this slug already exists");
    }

    const now = new Date();
    const achievement: Omit<Achievement, "_id"> = {
      slug,
      name,
      description,
      icon,
      category,
      triggerType: "manual",
      isHidden: false,
      order: order ?? 999,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<Achievement>("achievements").insertOne({
      ...achievement,
      _id: new ObjectId(),
    } as Achievement);

    invalidateDefinitionsCache();

    return NextResponse.json({
      success: true,
      id: result.insertedId.toString(),
      message: `Achievement "${name}" created.`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
