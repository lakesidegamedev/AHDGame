/**
 * Which of a country's units the Commanding General's page must load.
 *
 * Two questions, two answers: the command's ESTABLISHMENT is
 * `command.unitIds` (what the structure panel lists), while the force that
 * actually ARRIVES at a front is every unit whose `assignedGeneralId` is a
 * general this command posts, since `theaterOfUnit` resolves a unit's front
 * from its general alone. The two diverge in live data, so load the union.
 */
export function unitsForCommandPage<T extends { assignedGeneralId: string | null }>(
  units: T[],
  idOf: (unit: T) => string,
  command: { unitIds: string[]; commanderIds: string[] }
): T[] {
  const establishment = new Set(command.unitIds);
  const ownGenerals = new Set(command.commanderIds);
  return units.filter(
    (unit) =>
      establishment.has(idOf(unit)) ||
      (unit.assignedGeneralId !== null && ownGenerals.has(unit.assignedGeneralId))
  );
}
