import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { Achievement, CharacterAchievement } from "@/lib/db/types";
import { invalidateRarityCache } from "@/lib/achievements/cache";
import { getContestRoundsCollection } from "./collection";
import { contestAchievementMilestones, type ContestPlacing } from "./rules/history";
import { usersCollection } from "@/lib/db/repositories/users";
import type { Document } from "mongodb";
import { achievementsCollection } from "@/lib/db/repositories/achievements";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";

/** Reconcile from durable results, with batched reads/writes and retry-safe ids. */
export async function reconcileContestAchievements(
  db: Db,
  userIds?: readonly string[]
): Promise<void> {
  if (userIds?.length === 0) return;
  const records = await getContestRoundsCollection(db)
    .aggregate<{
      _id: string;
      placings: Array<ContestPlacing & { characterId?: string | null }>;
    }>([
      {
        $match: {
          status: "settled",
          "winners.userId": userIds ? { $in: userIds } : { $type: "string" },
        },
      },
      { $unwind: "$winners" },
      {
        $match: {
          "winners.userId": userIds ? { $in: userIds } : { $type: "string" },
          "winners.score": { $gt: 0 },
        },
      },
      { $sort: { settledAt: 1, roundNumber: 1, _id: 1 } },
      {
        $group: {
          _id: "$winners.userId",
          placings: {
            $push: {
              characterId: {
                $cond: [{ $eq: [{ $type: "$settledAt" }, "date"] }, "$winners.characterId", null],
              },
              kind: "$kind",
              roundNumber: "$roundNumber",
              iterationKey: "$iterationKey",
              rank: { $ifNull: ["$winners.rank", 1] },
            },
          },
        },
      },
    ])
    .toArray();
  if (records.length === 0) return;
  const owners = records.filter((r) => ObjectId.isValid(r._id)).map((r) => new ObjectId(r._id));
  const [definitions, existing, users] = await Promise.all([
    achievementsCollection(db).find({}).toArray(),
    characterAchievementsCollection(db)
      .find({ userId: { $in: owners } }, { projection: { userId: 1, achievementId: 1 } })
      .toArray(),
    usersCollection<Document>(db)
      .find({ _id: { $in: owners }, isBanned: { $ne: true } }, { projection: { _id: 1 } })
      .toArray(),
  ]);
  const eligibleOwners = new Set(users.map((u) => u._id.toString()));
  const have = new Map<string, Set<string>>();
  for (const row of existing) {
    const ids = have.get(row.userId.toString()) ?? new Set<string>();
    ids.add(row.achievementId.toString());
    have.set(row.userId.toString(), ids);
  }
  const bySlug = new Map(definitions.map((d) => [d.slug, d]));
  const now = new Date();
  const docs: CharacterAchievement[] = [];
  const add = (userId: string, slug: string, characterId: string | undefined) => {
    const definition = bySlug.get(slug);
    if (!definition) return;
    const earned = have.get(userId) ?? new Set<string>();
    if (earned.has(definition._id.toString())) return;
    earned.add(definition._id.toString());
    have.set(userId, earned);
    docs.push({
      _id: new ObjectId(
        createHash("sha256")
          .update(`contest-achievement:${userId}:${definition._id}`)
          .digest("hex")
          .slice(0, 24)
      ),
      userId: new ObjectId(userId),
      achievementId: definition._id,
      ...(characterId && ObjectId.isValid(characterId)
        ? { characterId: new ObjectId(characterId) }
        : {}),
      earnedAt: now,
    });
  };
  const required = definitions
    .filter((d) => d.slug !== "completionist")
    .map((d) => d._id.toString());
  for (const record of records) {
    if (!eligibleOwners.has(record._id)) continue;
    for (const milestone of contestAchievementMilestones(record.placings))
      add(record._id, milestone.slug, milestone.characterId);
    if (required.length > 0 && required.every((id) => have.get(record._id)?.has(id)))
      add(record._id, "completionist", record.placings.at(-1)?.characterId ?? undefined);
  }
  if (docs.length === 0) return;
  // Rows written before achievements carried a userId are keyed only by
  // (characterId, achievementId), which the unique index enforces. The userId
  // read above cannot see them, so a fresh insert for the same character
  // collides and fails the whole batch. Treat such a row as the award already
  // made, and stamp the owner on it instead of inserting a duplicate.
  const keyed = docs.filter((doc) => doc.characterId);
  const legacy = keyed.length
    ? await characterAchievementsCollection(db)
        .find(
          {
            $or: keyed.map((doc) => ({
              characterId: doc.characterId,
              achievementId: doc.achievementId,
            })),
          },
          { projection: { _id: 1, characterId: 1, achievementId: 1, userId: 1 } }
        )
        .toArray()
    : [];
  const pairKey = (characterId: ObjectId | undefined, achievementId: ObjectId) =>
    `${characterId?.toString()}:${achievementId.toString()}`;
  const legacyByPair = new Map(
    legacy.map((row) => [pairKey(row.characterId, row.achievementId), row])
  );
  const writes = docs.map((doc) => {
    const row = doc.characterId
      ? legacyByPair.get(pairKey(doc.characterId, doc.achievementId))
      : undefined;
    if (!row) {
      return {
        updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
      };
    }
    return {
      updateOne: {
        filter: { _id: row._id, userId: { $exists: false } },
        update: { $set: { userId: doc.userId } },
      },
    };
  });
  await characterAchievementsCollection(db).bulkWrite(writes, { ordered: false });
  invalidateRarityCache();
}
