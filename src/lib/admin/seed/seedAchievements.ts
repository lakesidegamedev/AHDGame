import { ObjectId, type Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { Achievement, User } from "@/lib/db/types";
import { getAchievementDocsForSeed } from "@/lib/seeds/achievements";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { usersCollection } from "@/lib/db/repositories/users";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import type { Document } from "mongodb";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";

export async function seedAchievements(db: Db, reset: boolean, log: (msg: string) => void) {
  if (reset)
    await achievementsCollection<Document>(db)
      .drop()
      .catch((error) => {
        logWarning("Collection drop failed (may not exist)", {
          component: "AdminSeed",
          action: "drop collection",
          metadata: { error: String(error) },
        });
      });
  const achievementDocs = getAchievementDocsForSeed();
  const existingCount = await achievementsCollection<Document>(db).countDocuments();
  if (existingCount === 0 || reset) {
    if (!reset && existingCount > 0) {
      log(`Achievements already seeded (${existingCount} exist), skipped`);
    } else {
      await achievementsCollection(db).insertMany(achievementDocs);
      await achievementsCollection<Document>(db)
        .createIndex({ slug: 1 }, { unique: true })
        .catch((error) => {
          logWarning("Index creation failed (may already exist)", {
            component: "AdminSeed",
            action: "createIndex",
            metadata: { index: "slug", error: String(error) },
          });
        });
      await characterAchievementsCollection<Document>(db)
        .createIndex({ characterId: 1, achievementId: 1 }, { unique: true })
        .catch((error) => {
          logWarning("Index creation failed (may already exist)", {
            component: "AdminSeed",
            action: "createIndex",
            metadata: { index: "characterId_achievementId", error: String(error) },
          });
        });
      await characterAchievementsCollection<Document>(db)
        .createIndex({ achievementId: 1 })
        .catch((error) => {
          logWarning("Index creation failed (may already exist)", {
            component: "AdminSeed",
            action: "createIndex",
            metadata: { index: "achievementId", error: String(error) },
          });
        });
      log(`Seeded ${achievementDocs.length} achievements`);
    }
  } else {
    log(`Achievements already seeded (${existingCount} exist), skipped`);
  }

  // Grant all achievements to admin characters
  const allAchievements = (await achievementsCollection(db).find({}).toArray()) as Array<
    Achievement & { _id: ObjectId }
  >;
  if (allAchievements.length > 0) {
    const adminUsers = await usersCollection(db)
      .find({ $or: [{ isAdmin: true }, { role: "admin" }] })
      .toArray();
    const adminUserIds = adminUsers.map((u: User) => u._id);
    const adminCharacters =
      adminUserIds.length > 0
        ? await charactersCollection(db)
            .find({ userId: { $in: adminUserIds } })
            .toArray()
        : [];
    let adminGrants = 0;
    for (const char of adminCharacters) {
      for (const a of allAchievements) {
        try {
          await characterAchievementsCollection<Document>(db).insertOne({
            _id: new ObjectId(),
            characterId: char._id,
            achievementId: a._id,
            earnedAt: new Date(),
          });
          adminGrants++;
        } catch {
          // duplicate - already has it
        }
      }
    }
    if (adminGrants > 0)
      log(
        `Granted achievements to ${adminCharacters.length} admin character(s) (${adminGrants} grants)`
      );
  }
}
