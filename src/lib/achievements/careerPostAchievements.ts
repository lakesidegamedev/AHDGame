/**
 * Achievements earned through the career sync (lib/careerPosts).
 * One source for the seed list and the sync, which also adds the definition to
 * worlds that seeded achievements before it existed.
 */
export const INTERNATIONAL_LEADER_SLUG = "international_leader";

export const INTERNATIONAL_LEADER_ACHIEVEMENT = {
  slug: INTERNATIONAL_LEADER_SLUG,
  name: "Chair of the Assembly",
  description: "Led an international organization",
  icon: "Landmark",
  category: "election" as const,
  triggerType: "career_post",
  isHidden: false,
  order: 73,
};
