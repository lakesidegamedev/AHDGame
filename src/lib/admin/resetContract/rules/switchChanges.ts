/**
 * Which admin switches a world reset changed.
 *
 * A reset writes the fresh-world flag preset over the outgoing values, so a
 * switch an admin flipped after the previous reset is reverted. Which switches
 * survive is an owner decision; this rule only makes every reverted one
 * visible so the operator can restore it deliberately.
 */

export type SwitchSource = "gameState" | "gameConfig";

export interface SwitchChange {
  source: SwitchSource;
  name: string;
  before: unknown;
  after: unknown;
}

/** Absent and undefined are the same "unset" state. */
function normalize(value: unknown): unknown {
  return value === undefined ? null : value;
}

export function diffSwitches(
  source: SwitchSource,
  names: readonly string[],
  before: Readonly<Record<string, unknown>> | null | undefined,
  after: Readonly<Record<string, unknown>> | null | undefined
): SwitchChange[] {
  const changes: SwitchChange[] = [];
  for (const name of [...names].sort()) {
    const was = normalize(before?.[name]);
    const now = normalize(after?.[name]);
    if (was === now) continue;
    changes.push({ source, name, before: was, after: now });
  }
  return changes;
}

export function formatSwitchChange(change: SwitchChange): string {
  return `${change.source}.${change.name}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`;
}
