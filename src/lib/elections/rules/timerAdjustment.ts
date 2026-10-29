/**
 * Admin election timer edits preserve the phase that was not edited.
 * Stored primaryDurationHours is the Primary length; adjustElectionDurations
 * keeps the total at least one turn, including zero-length phase requests.
 */
interface Durations {
  durationHours: number;
  primaryDurationHours: number;
}

export function adjustElectionDurations(
  current: Partial<Durations> & {
    startTurn?: number;
    primaryEndTurn?: number;
    endTurn?: number;
  },
  defaults: Durations,
  edit: { action: "set" | "add" | "subtract"; primaryHours?: number; generalHours?: number }
): Durations & { generalDurationHours: number } {
  // Numeric deadlines are authoritative, including races edited by the old
  // admin handler that wrote the General length into primaryDurationHours.
  const { startTurn, primaryEndTurn, endTurn } = current;
  const hasBounds =
    typeof startTurn === "number" &&
    typeof primaryEndTurn === "number" &&
    typeof endTurn === "number" &&
    [startTurn, primaryEndTurn, endTurn].every(Number.isFinite) &&
    startTurn <= primaryEndTurn &&
    primaryEndTurn <= endTurn;
  const total = hasBounds ? endTurn - startTurn : (current.durationHours ?? defaults.durationHours);
  let primary = hasBounds
    ? primaryEndTurn - startTurn
    : Math.max(0, Math.min(total, current.primaryDurationHours ?? defaults.primaryDurationHours));
  let general = total - primary;
  const adjust = (value: number, amount: number | undefined) => {
    if (amount === undefined) return value;
    if (edit.action === "set") return amount;
    return edit.action === "add" ? value + amount : Math.max(0, value - amount);
  };
  primary = adjust(primary, edit.primaryHours);
  general = adjust(general, edit.generalHours);
  const adjustedTotal = Math.max(1, primary + general);
  return {
    durationHours: adjustedTotal,
    primaryDurationHours: primary,
    generalDurationHours: adjustedTotal - primary,
  };
}
