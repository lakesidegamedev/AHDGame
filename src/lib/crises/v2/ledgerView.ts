import type {
  AccountabilityEntry,
  ActiveCrisisStage,
  CrisisDefinition,
  CrisisRole,
  LeverCost,
} from "./types";

export const ROLE_LABEL: Record<CrisisRole, string> = {
  headOfState: "Head of state",
  stateGovernor: "Governor",
  legislature: "Legislature",
  centralBankChair: "Central bank chair",
  financeMinister: "Finance minister",
  corpCeo: "Company CEO",
  partyLeader: "Party leader",
};

export const STAGE_LABEL: Record<ActiveCrisisStage | "resolved", string> = {
  signal: "Early warning",
  onset: "Onset",
  peak: "Peak",
  aftermath: "Aftermath",
  resolved: "Resolved",
};

export interface LedgerRowView {
  turn: number;
  stage: ActiveCrisisStage;
  role: CrisisRole;
  roleLabel: string;
  holderName: string;
  /** Lever label, or null when the holder could act and did nothing. */
  action: string | null;
  severity: number;
}

/**
 * Newest turns first. Holders with no known name show as their office only, so
 * a deleted character never leaks an id into the page.
 */
export function ledgerView(
  ledger: readonly AccountabilityEntry[],
  def: Pick<CrisisDefinition, "levers"> | undefined,
  names: ReadonlyMap<string, string>,
  limit = 40
): LedgerRowView[] {
  const labels = new Map((def?.levers ?? []).map((lever) => [lever.id, lever.label]));
  return [...ledger]
    .sort((a, b) => b.turn - a.turn)
    .slice(0, limit)
    .map((entry) => ({
      turn: entry.turn,
      stage: entry.stage,
      role: entry.role,
      roleLabel: ROLE_LABEL[entry.role],
      holderName: names.get(entry.holderId) ?? ROLE_LABEL[entry.role],
      action: entry.leverId === null ? null : (labels.get(entry.leverId) ?? entry.leverId),
      severity: Math.round(entry.severity),
    }));
}

/** Cost lines in plain words, only for resources the lever actually spends. */
export function costLines(cost: LeverCost, formatMoney: (amount: number) => string): string[] {
  const lines: string[] = [];
  if (cost.treasuryCash) lines.push(`${formatMoney(cost.treasuryCash)} from the treasury`);
  if (cost.corpCash) lines.push(`${formatMoney(cost.corpCash)} from company cash`);
  if (cost.approval && cost.approval.points) {
    lines.push(`${cost.approval.points} points of approval`);
  }
  if (cost.politicalCapital) {
    const n = cost.politicalCapital;
    lines.push(`${n} ${n === 1 ? "action" : "actions"}`);
  }
  return lines;
}
