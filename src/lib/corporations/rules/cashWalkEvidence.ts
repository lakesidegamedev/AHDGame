export interface CashSnapshotTime {
  turn?: number;
  createdAt?: Date;
  cashSnapshotAt?: Date;
}

function validDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function cashWalkEvidence(
  latest: CashSnapshotTime & { turn: number },
  previous: CashSnapshotTime | null
) {
  const recorded = validDate(latest.cashSnapshotAt) && validDate(previous?.cashSnapshotAt);
  const end = latest.cashSnapshotAt ?? latest.createdAt;
  const start = previous?.cashSnapshotAt ?? previous?.createdAt;
  if (validDate(start) && validDate(end) && start < end) {
    return {
      boundary: recorded ? ("recorded" as const) : ("estimated" as const),
      filter: { createdAt: { $gt: start, $lte: end } },
    };
  }
  return { boundary: "turn" as const, filter: { turn: latest.turn } };
}

export interface CashMovementGroup {
  _id: { type: string; currencyCode: string };
  amount: number;
  anchorAmount: number;
  count: number;
  missingAnchor: number;
}

/** Convert only groups with a known historical currency basis. */
export function reportingCashFlows(
  groups: readonly CashMovementGroup[],
  currency?: string,
  rate?: number
) {
  const flows: { type: string; amount: number }[] = [];
  let unconvertedMovements = 0;
  for (const group of groups) {
    const anchorKnown = group.missingAnchor === 0 && Number.isFinite(group.anchorAmount);
    let amount: number | null = null;
    if (currency && group._id.currencyCode === currency) amount = group.amount;
    else if (anchorKnown) {
      const factor = currency ? rate : 1;
      if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
        amount = group.anchorAmount * factor;
      }
    }
    if (amount == null || !Number.isFinite(amount)) unconvertedMovements += group.count;
    else flows.push({ type: group._id.type, amount });
  }
  return { flows, unconvertedMovements };
}
