/**
 * Player whips are advisory on every vote. canIssueWhip prevents leadership
 * from forcing player votes while preserving both hard and soft NPP whips.
 */
export function canIssueWhip(directive: {
  audience: "npp" | "character";
  mode: "soft" | "hard";
}): boolean {
  return directive.audience !== "character" || directive.mode === "soft";
}
