import type { ObjectId } from "mongodb";

export type AchievementCategory =
  "milestone" | "election" | "legislation" | "social" | "action" | "special";

export interface Achievement {
  _id: ObjectId;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  isHidden: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterAchievement {
  _id: ObjectId;
  userId: ObjectId;
  characterId?: ObjectId;
  achievementId: ObjectId;
  earnedAt: Date;
  grantedBy?: ObjectId;
  /**
   * Name of the character that earned it, stored at award time so the award
   * keeps that name after the character is retired or replaced. Older rows
   * have none.
   */
  characterName?: string;
}
