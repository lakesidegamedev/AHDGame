/**
 * Collections an operator or script leaves behind that hold copies of an
 * outgoing world: heal and recovery snapshots, backups, one-off rollout records.
 * None is in the seed manifest, so a reset never empties them, and none belongs
 * in a fresh world. Matched by name; a manifest collection is never a match.
 */

export interface WorldCopyGroup {
  label: string;
  pattern: RegExp;
}

export const WORLD_COPY_GROUPS: readonly WorldCopyGroup[] = Object.freeze([
  { label: "recovery and heal snapshots (*_snap_*)", pattern: /_snap_|_snap$/ },
  { label: "backups (*_backup*)", pattern: /_backup|^incident_backup/ },
  { label: "dated one-off collections (*_YYYYMMDD)", pattern: /_\d{8}$/ },
  { label: "heal one-offs (heal_*)", pattern: /^heal_/ },
  {
    label: "economy recovery and rollout records",
    pattern: /^(marketRecoveryLog|economyGoLiveGrants|economyInterventionRollout.*)$/,
  },
]);

export interface WorldCopyFinding {
  label: string;
  names: string[];
}

/** Collections of the given names that are world copies and not in the manifest. */
export function findWorldCopyCollections(
  names: readonly string[],
  isClassified: (name: string) => boolean
): WorldCopyFinding[] {
  const found: WorldCopyFinding[] = [];
  for (const group of WORLD_COPY_GROUPS) {
    const matched = names
      .filter((n) => !n.startsWith("system.") && !isClassified(n) && group.pattern.test(n))
      .sort();
    if (matched.length > 0) found.push({ label: group.label, names: matched });
  }
  return found;
}
