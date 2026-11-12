import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAllAchievements } from "@/lib/achievements";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";
import type { Document } from "mongodb";

/** Every achievement definition with how many characters have earned it, for the staff panels. */
export async function listAchievementsWithEarnedCounts() {
  const achievements = await getAllAchievements();
  const db = await getDb();

  const counts = await characterAchievementsCollection<Document>(db)
    .aggregate<{ _id: ObjectId; count: number }>([
      { $group: { _id: "$achievementId", count: { $sum: 1 } } },
    ])
    .toArray();
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return achievements.map((a) => ({
    id: a._id.toString(),
    slug: a.slug,
    name: a.name,
    description: a.description,
    icon: a.icon,
    category: a.category,
    triggerType: a.triggerType,
    order: a.order,
    earnedCount: countMap.get(a._id.toString()) ?? 0,
  }));
}
