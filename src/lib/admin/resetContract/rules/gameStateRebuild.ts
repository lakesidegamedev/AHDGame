/**
 * The `gameState` singleton is rebuilt, not patched: after a reset it holds
 * exactly the fresh-world writes plus the fields on an explicit keep list.
 * Every other field the outgoing world left behind is removed, including
 * fields no type declares, so a value cannot survive by being unknown.
 */
export interface GameStateRebuildPlan {
  /** Every top-level field to remove from the surviving document. */
  unset: string[];
  /** Outgoing fields carried forward because the keep list names them. */
  kept: string[];
}

/**
 * @param outgoingFields Top-level field names on the outgoing document.
 * @param freshWrites Fields the reset writes for the new world.
 * @param keepFields Fields deliberately carried across a reset.
 * @param forcedUnset Fields that must go even if a keep reason names them.
 */
export function planGameStateRebuild(
  outgoingFields: Iterable<string>,
  freshWrites: Iterable<string>,
  keepFields: Iterable<string>,
  forcedUnset: Iterable<string>
): GameStateRebuildPlan {
  const written = new Set(freshWrites);
  const forced = new Set(forcedUnset);
  const keepable = new Set([...keepFields].filter((field) => !forced.has(field)));
  const unset = new Set<string>();
  const kept: string[] = [];
  for (const field of forced) if (!written.has(field)) unset.add(field);
  for (const field of outgoingFields) {
    if (field === "_id" || written.has(field)) continue;
    if (keepable.has(field)) kept.push(field);
    else unset.add(field);
  }
  return { unset: [...unset].sort(), kept: kept.sort() };
}
