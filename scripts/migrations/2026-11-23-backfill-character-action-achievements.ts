/**
 * Backfill action-count achievements that characters already earned but never
 * received. Awards used to be skipped for a character whenever a sibling
 * character on the same account held the achievement.
 *
 * Only action_count achievements are touched: their progress is a plain count
 * of the character's own action log. A character is granted a missing one when
 * its count meets the target. Existing rows are never changed.
 *
 * Usage: npx tsx scripts/migrations/2026-11-23-backfill-character-action-achievements.ts          # dry run
 *        npx tsx scripts/migrations/2026-11-23-backfill-character-action-achievements.ts --apply  # write
 */
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { filterAchievementRowsForCharacter } from "../../src/lib/achievements";
import { getAchievementProgressMap } from "../../src/lib/achievements/progress";
import { isAdditionalCharacter } from "../../src/lib/character/additionalCharacter";
import type { Achievement } from "../../src/lib/db/types";

export interface BackfillGrant {
  userId: ObjectId;
  characterId: ObjectId;
  achievementId: ObjectId;
  slug: string;
}

export interface BackfillCharacter {
  _id: ObjectId;
  userId: ObjectId;
  /** True when the account had an older character first. */
  additional: boolean;
}

/** Pure: which (character, achievement) pairs are owed, given progress and held rows. */
export function planBackfill(input: {
  characters: BackfillCharacter[];
  achievements: Achievement[];
  heldRows: Array<{ userId: ObjectId; characterId?: ObjectId | null; achievementId: ObjectId }>;
  progress: (
    character: BackfillCharacter,
    achievement: Achievement
  ) => { current: number; target: number } | null;
}): BackfillGrant[] {
  const grants: BackfillGrant[] = [];
  for (const character of input.characters) {
    const rows = filterAchievementRowsForCharacter(
      input.heldRows.filter((row) => row.userId.equals(character.userId)),
      { characterId: character._id, includeUntagged: !character.additional }
    );
    const held = new Set(rows.map((row) => row.achievementId.toString()));
    for (const achievement of input.achievements) {
      if (achievement.triggerType !== "action_count") continue;
      if (held.has(achievement._id.toString())) continue;
      const progress = input.progress(character, achievement);
      if (!progress || !Number.isFinite(progress.target)) continue;
      if (progress.current >= progress.target) {
        grants.push({
          userId: character.userId,
          characterId: character._id,
          achievementId: achievement._id,
          slug: achievement.slug,
        });
      }
    }
  }
  return grants;
}

export async function runBackfill(db: Db, apply: boolean): Promise<BackfillGrant[]> {
  const achievements = (await db
    .collection<Achievement>("achievements")
    .find({ triggerType: "action_count" })
    .toArray()) as Achievement[];
  const characterDocs = await db
    .collection("characters")
    .find({}, { projection: { _id: 1, userId: 1, createdAt: 1, funds: 1 } })
    .toArray();
  const heldRows = await db
    .collection("characterAchievements")
    .find({}, { projection: { userId: 1, characterId: 1, achievementId: 1 } })
    .toArray();

  const progressByCharacter = new Map<string, Map<string, { current: number; target: number }>>();
  const characters: BackfillCharacter[] = [];
  for (const doc of characterDocs) {
    const map = await getAchievementProgressMap(
      db,
      { _id: doc._id, userId: doc.userId, funds: doc.funds },
      achievements
    );
    const clean = new Map<string, { current: number; target: number }>();
    for (const [key, value] of map) if (value) clean.set(key, value);
    progressByCharacter.set(doc._id.toString(), clean);
    characters.push({
      _id: doc._id,
      userId: doc.userId,
      additional: await isAdditionalCharacter(db, {
        _id: doc._id,
        userId: doc.userId,
        createdAt: doc.createdAt,
      }),
    });
  }

  const grants = planBackfill({
    characters,
    achievements,
    heldRows: heldRows as never,
    progress: (character, achievement) =>
      progressByCharacter.get(character._id.toString())?.get(achievement._id.toString()) ?? null,
  });

  if (apply && grants.length > 0) {
    const now = new Date();
    await db.collection("characterAchievements").insertMany(
      grants.map((grant) => ({
        _id: new ObjectId(),
        userId: grant.userId,
        characterId: grant.characterId,
        achievementId: grant.achievementId,
        earnedAt: now,
      })),
      { ordered: false }
    );
  }
  return grants;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  const grants = await runBackfill(db, apply);
  console.log(`${apply ? "Granted" : "[DRY RUN] would grant"} ${grants.length} achievements`);
  for (const grant of grants) console.log(`  ${grant.characterId.toString()} ${grant.slug}`);
  await closeDb();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}
