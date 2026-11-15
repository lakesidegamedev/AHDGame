import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireLakesideToken } from "@/lib/api/requireLakesideToken";
import { parseJsonBody } from "@/lib/api/validate";
import { ObjectId } from "mongodb";
import {
  applyPatreonStatus,
  getGracePeriodEnd,
  startPatreonGracePeriod,
} from "@/lib/patreon/service";
import { SUPPORTER_TIERS } from "@/lib/db/types";
import { usersCollection } from "@/lib/db/repositories/users";

// POST /api/webhooks/lakeside-subscription
// Lakeside portal pushes Stripe subscription changes here so AHD grants
// the same benefits as the equivalent Patreon tiers.
//
// Auth: Authorization: Bearer $LAKESIDE_S2S_TOKEN (requireLakesideToken).
// Body: { ahdUserId, tier: "supporter" | "supporter-plus" | "supporter-plus-plus" | null,
//         active: boolean, currentPeriodEnd: ISO string | null }
//
// active + tier: applyPatreonStatus. Expiry is currentPeriodEnd plus the
// 30-day Patreon grace constant so a missed Stripe renewal lapses on the
// same clock as a patron. Null currentPeriodEnd means no known expiry.
// inactive or null tier: startPatreonGracePeriod (30d), matching a
// cancelled patron. The user is matched by _id only; an email field is
// ignored. Missing or malformed ahdUserId: 400, no write. Unknown id: 404 JSON.
//
// Idempotent: applyPatreonStatus / startPatreonGracePeriod are $set updates,
// so replaying an event converges.

const schema = z.object({
  ahdUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  tier: z.enum(SUPPORTER_TIERS).nullable(),
  active: z.boolean(),
  currentPeriodEnd: z.string().datetime().nullable(),
});

export async function POST(request: Request) {
  try {
    if (!requireLakesideToken(request)) {
      return errorResponse(401, "Unauthorized");
    }

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { ahdUserId, tier, active, currentPeriodEnd } = parsed.data;

    const db = await getDb();

    const user = await usersCollection(db).findOne(
      { _id: new ObjectId(ahdUserId) },
      { projection: { _id: 1 } }
    );

    if (!user) {
      return errorResponse(404, "unknown_user", { extra: { ok: false } });
    }

    if (active && tier !== null) {
      // Grant / upgrade / downgrade. Expiry = period end + grace window so a
      // missed renewal degrades exactly like a lapsed patron.
      const expiresAt = currentPeriodEnd ? getGracePeriodEnd(new Date(currentPeriodEnd)) : null;
      await applyPatreonStatus(db, {
        userId: user._id,
        tier,
        expiresAt,
        adsDisabledDefault: true,
        provider: "stripe",
      });
      return NextResponse.json({ ok: true, status: "active", tier });
    }

    // Cancelled / lapsed / no tier: start the 30-day grace countdown.
    await startPatreonGracePeriod(db, user._id);
    return NextResponse.json({ ok: true, status: "grace_period" });
  } catch (error) {
    return handleRouteError(error);
  }
}
