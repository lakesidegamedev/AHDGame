/** What a player is told when the era they picked cannot be seeded on this game version. */
export function unreadyEraMessage(preset: string): string {
  const year = /^(\d{4})-/.exec(preset)?.[1];
  return year
    ? `The ${year} world is being rebuilt and cannot be started on this game version yet.`
    : "That world is being rebuilt and cannot be started on this game version yet.";
}
