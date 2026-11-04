/** Approval overlays fade toward zero without rounding their stored balance. */
export const APPROVAL_DECAY_RATE = 0.005;
export const APPROVAL_ZERO_THRESHOLD = 0.01;

/** Null means no persistence change is needed. Keep full precision between turns. */
export function decayApprovals(
  approvals: Readonly<Record<string, number>> | undefined
): Record<string, number> | null {
  if (!approvals || Object.keys(approvals).length === 0) return null;
  const decayed: Record<string, number> = {};
  let changed = false;
  for (const [bucket, value] of Object.entries(approvals)) {
    const next = value * (1 - APPROVAL_DECAY_RATE);
    decayed[bucket] = Math.abs(next) < APPROVAL_ZERO_THRESHOLD ? 0 : next;
    if (decayed[bucket] !== value) changed = true;
  }
  return changed ? decayed : null;
}
