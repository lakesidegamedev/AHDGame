import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAccountAchievements } from "@/lib/achievements";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { requireLakesideToken } from "@/lib/api/requireLakesideToken";
import { parseJsonBody } from "@/lib/api/validate";
import { withNoStore } from "@/lib/api/withNoStore";

const schema = z.object({ ahdUserId: z.string().regex(/^[0-9a-f]{24}$/i) });

export const POST = withNoStore(async (request: Request) => {
  try {
    if (!requireLakesideToken(request)) return errorResponse(401, "Unauthorized");

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const earned = await loadAccountAchievements(new ObjectId(parsed.data.ahdUserId));
    return NextResponse.json({
      status: "synced",
      achievements: earned.map(({ achievement, earnedAt }) => ({
        id: achievement.slug,
        name: achievement.name,
        description: achievement.description,
        earnedAt: earnedAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
