import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getAchievementDocsForSeed, ACHIEVEMENT_SEED } from "@/lib/seeds/achievements";
import { invalidateDefinitionsCache } from "@/lib/achievements/cache";
import type { Achievement } from "@/lib/db/types";
import { logWarning } from "@/lib/utils/errorLog";
import { ObjectId } from "mongodb";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import type { Document } from "mongodb";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";

// POST /api/admin/achievements/seed — Seeds achievement definitions from static seed data if the collection is empty.
// Auth: requireAdmin
// Errors: 403
export const POST = withAdminAuth(async () => {
  try {
    const db = await getDb();
    const achievementCount = await achievementsCollection<Document>(db).countDocuments();

    if (achievementCount > 0) {
      return NextResponse.json({
        success: false,
        message: `Achievements already seeded (${achievementCount} definitions exist).`,
        count: achievementCount,
      });
    }

    const achievementDocs = getAchievementDocsForSeed();
    await achievementsCollection(db).insertMany(achievementDocs);
    await achievementsCollection<Document>(db)
      .createIndex({ slug: 1 }, { unique: true })
      .catch((error) => {
        logWarning("Index creation failed (may already exist)", {
          component: "AchievementsSeedRoute",
          action: "createIndex",
          metadata: { index: "slug", error: String(error) },
        });
      });
    await characterAchievementsCollection<Document>(db)
      .createIndex({ characterId: 1, achievementId: 1 }, { unique: true })
      .catch((error) => {
        logWarning("Index creation failed (may already exist)", {
          component: "AchievementsSeedRoute",
          action: "createIndex",
          metadata: { index: "characterId_achievementId", error: String(error) },
        });
      });
    await characterAchievementsCollection<Document>(db)
      .createIndex({ achievementId: 1 })
      .catch((error) => {
        logWarning("Index creation failed (may already exist)", {
          component: "AchievementsSeedRoute",
          action: "createIndex",
          metadata: { index: "achievementId", error: String(error) },
        });
      });

    invalidateDefinitionsCache();

    return NextResponse.json({
      success: true,
      message: `Seeded ${achievementDocs.length} achievement definitions.`,
      count: achievementDocs.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
});

// PATCH /api/admin/achievements/seed — Syncs achievement names, descriptions, and icons from seed data to existing DB records.
// Auth: requireAdmin
// Errors: 403
export const PATCH = withAdminAuth(async () => {
  try {
    const db = await getDb();
    const col = achievementsCollection<Document>(db);
    let synced = 0;
    let inserted = 0;

    for (const seed of ACHIEVEMENT_SEED) {
      const current = await col.findOne({ slug: seed.slug }, { projection: { _id: 1 } });
      if (!current) {
        await col.insertOne({
          ...seed,
          _id: new ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        inserted++;
        continue;
      }
      const result = await col.updateOne(
        { slug: seed.slug },
        {
          $set: {
            name: seed.name,
            description: seed.description,
            icon: seed.icon,
            category: seed.category,
            updatedAt: new Date(),
          },
        }
      );
      if (result.matchedCount > 0) synced++;
    }

    invalidateDefinitionsCache();

    return NextResponse.json({
      success: true,
      message: `Synced ${synced} existing, inserted ${inserted} new.`,
      updated: synced,
      inserted,
      total: ACHIEVEMENT_SEED.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
});
