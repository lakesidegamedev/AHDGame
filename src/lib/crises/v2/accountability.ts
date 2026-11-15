import {
  clamp,
  type AccountabilityEntry,
  type ActiveCrisisStage,
  type CrisisDefinition,
  type CrisisInstance,
  type CrisisRole,
  type LeverCost,
} from "./types";
import type { AcceptedLeverUse } from "./severity";

/** How much a turn's action or inaction counts, by the stage it happened in. */
export const STAGE_ACCOUNTABILITY_WEIGHT: Record<ActiveCrisisStage, number> = {
  signal: 0.5,
  onset: 1,
  peak: 1.5,
  aftermath: 0.5,
};

/** Office holders by role at the turn being recorded. A role may have several. */
export type OfficeHolders = Partial<Record<CrisisRole, readonly string[]>>;

/** Ledger length kept per instance; the oldest rows drop first. */
export const LEDGER_LIMIT = 400;

function trim(ledger: AccountabilityEntry[]): AccountabilityEntry[] {
  return ledger.length > LEDGER_LIMIT ? ledger.slice(-LEDGER_LIMIT) : ledger;
}

/** Appends the levers that counted this turn. Unaccepted uses leave no trace. */
export function recordLeverUses(
  instance: CrisisInstance,
  accepted: readonly AcceptedLeverUse[],
  turn: number
): CrisisInstance {
  if (instance.stage === "resolved" || accepted.length === 0) return instance;
  const stage = instance.stage;
  const rows: AccountabilityEntry[] = accepted.map(({ use, lever, mitigation }) => ({
    turn,
    stage,
    role: lever.role,
    holderId: use.holderId,
    leverId: lever.id,
    cost: scaleCost(lever.cost, use.intensity ?? 1),
    mitigation,
    severity: instance.severity,
  }));
  return { ...instance, ledger: trim([...instance.ledger, ...rows]) };
}

/**
 * Appends an inaction row for each current holder of a role that has a lever
 * offered in this stage and pulled none this turn. Quiet stages do not blame
 * anyone: only onset and peak expect a response.
 */
export function recordInaction(
  instance: CrisisInstance,
  def: CrisisDefinition,
  holders: OfficeHolders,
  turn: number
): CrisisInstance {
  if (instance.stage !== "onset" && instance.stage !== "peak") return instance;
  const stage = instance.stage;
  const acted = new Set(
    instance.ledger
      .filter((entry) => entry.turn === turn && entry.leverId !== null)
      .map((entry) => `${entry.role}:${entry.holderId}`)
  );
  const alreadyIdle = new Set(
    instance.ledger
      .filter((entry) => entry.turn === turn && entry.leverId === null)
      .map((entry) => `${entry.role}:${entry.holderId}`)
  );
  const rolesWithLevers = new Set(
    def.levers.filter((lever) => !lever.stages || lever.stages.includes(stage)).map((l) => l.role)
  );

  const rows: AccountabilityEntry[] = [];
  for (const role of rolesWithLevers) {
    for (const holderId of holders[role] ?? []) {
      const key = `${role}:${holderId}`;
      if (acted.has(key) || alreadyIdle.has(key)) continue;
      rows.push({
        turn,
        stage,
        role,
        holderId,
        leverId: null,
        cost: {},
        mitigation: 0,
        severity: instance.severity,
      });
    }
  }
  if (rows.length === 0) return instance;
  return { ...instance, ledger: trim([...instance.ledger, ...rows]) };
}

export function scaleCost(cost: LeverCost, intensity: number): LeverCost {
  const scaled: LeverCost = {};
  if (cost.treasuryCash !== undefined) scaled.treasuryCash = cost.treasuryCash * intensity;
  if (cost.politicalCapital !== undefined)
    scaled.politicalCapital = cost.politicalCapital * intensity;
  if (cost.corpCash !== undefined) scaled.corpCash = cost.corpCash * intensity;
  if (cost.approval) {
    scaled.approval = { group: cost.approval.group, points: cost.approval.points * intensity };
  }
  return scaled;
}

export interface HolderScore {
  role: CrisisRole;
  holderId: string;
  /** Mitigation delivered, stage weighted. */
  credit: number;
  /** Severity left to run while holding a lever and not using it, stage weighted. */
  blame: number;
  net: number;
  actions: number;
  idleTurns: number;
}

/**
 * Blame and credit per (role, holder) from the ledger.
 *
 * Credit is mitigation delivered. Blame is the severity (as a 0..1 share) on
 * each turn a holder had a lever and did not pull one. Both are weighted by the
 * stage the turn fell in, so passivity at the peak costs more than in the
 * aftermath.
 */
export function computeAccountability(ledger: readonly AccountabilityEntry[]): HolderScore[] {
  const scores = new Map<string, HolderScore>();
  for (const entry of ledger) {
    const key = `${entry.role}:${entry.holderId}`;
    let score = scores.get(key);
    if (!score) {
      score = {
        role: entry.role,
        holderId: entry.holderId,
        credit: 0,
        blame: 0,
        net: 0,
        actions: 0,
        idleTurns: 0,
      };
      scores.set(key, score);
    }
    const weight = STAGE_ACCOUNTABILITY_WEIGHT[entry.stage];
    if (entry.leverId === null) {
      score.blame += weight * (entry.severity / 100);
      score.idleTurns += 1;
    } else {
      score.credit += weight * entry.mitigation;
      score.actions += 1;
    }
  }
  const result = [...scores.values()];
  for (const score of result) score.net = score.credit - score.blame;
  return result.sort(
    (a, b) => a.net - b.net || a.role.localeCompare(b.role) || a.holderId.localeCompare(b.holderId)
  );
}

/** Totals a ledger's resource spend per holder. */
export function totalCostByHolder(
  ledger: readonly AccountabilityEntry[]
): Map<string, Required<Pick<LeverCost, "treasuryCash" | "politicalCapital" | "corpCash">>> {
  const totals = new Map<
    string,
    Required<Pick<LeverCost, "treasuryCash" | "politicalCapital" | "corpCash">>
  >();
  for (const entry of ledger) {
    const key = `${entry.role}:${entry.holderId}`;
    const row = totals.get(key) ?? { treasuryCash: 0, politicalCapital: 0, corpCash: 0 };
    row.treasuryCash += entry.cost.treasuryCash ?? 0;
    row.politicalCapital += entry.cost.politicalCapital ?? 0;
    row.corpCash += entry.cost.corpCash ?? 0;
    totals.set(key, row);
  }
  return totals;
}

/**
 * Converts a holder's net score to an electoral swing in points, bounded by
 * `maxSwing`. Positive = credit. Smooth so a single turn cannot flip an office.
 */
export function electoralSwing(
  score: Pick<HolderScore, "net">,
  maxSwing: number,
  scale = 20
): number {
  if (maxSwing <= 0 || scale <= 0) return 0;
  return clamp(Math.tanh(score.net / scale) * maxSwing, -maxSwing, maxSwing);
}
