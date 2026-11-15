/**
 * Whether a money audit envelope is kept in `actionAuditLog`.
 *
 * Player/NPP/admin actor legs keep a full mirror (alt detection reads it).
 * System-actor legs are mirrored only when a detector can use them (related
 * supply-agreement settlements, party funding, party counterparties); the rest
 * live only in `financialTxLog`, which already holds the money trail. Mirroring
 * every leg was write amplification on the turn's critical path.
 *
 * `AUDIT_MIRROR_SYSTEM_MONEY=1` restores the full mirror for investigations.
 */
export interface MoneyMirrorCandidate {
  /** Audit action, for example `bond.coupon` or `party.transfer`. */
  action: string;
  /** Counterparty type from the audit envelope, when there is one. */
  counterpartyType?: string;
}

/**
 * System-actor money the anomaly detectors can still read. Keep this in step
 * with `anomalyCandidateClauses` in `src/lib/audit/anomalyScan.ts`; the point
 * is that nothing outside those clauses is ever read.
 */
export function isSystemMoneyMirrorRelevant(candidate: MoneyMirrorCandidate): boolean {
  if (candidate.action === "corp.supply_agreement") return true;
  if (candidate.action.startsWith("party.") || candidate.action.startsWith("caucus.")) return true;
  return candidate.counterpartyType === "party";
}

/**
 * Resolve the mirror decision. `actorKind` is the actor already resolved by
 * `recordAudit`: `system` for turn phases and cron work, `player`/`npp`/`admin`
 * for a request, or undefined when no context was available.
 *
 * An unknown actor is kept on purpose. It means "no audit context", not
 * "system": a route that has not adopted `setAuditRequestContext` yet must not
 * silently lose its player forensics. Every turn phase sets `system`
 * explicitly, so the turn's 54k mirror rows are still dropped.
 */
export function shouldMirrorMoneyAudit(input: {
  candidate: MoneyMirrorCandidate;
  actorKind?: string;
  fullSystemMoneyMirror?: boolean;
}): boolean {
  if (input.fullSystemMoneyMirror) return true;
  if (input.actorKind === undefined) return true;
  if (input.actorKind !== "system") return true;
  return isSystemMoneyMirrorRelevant(input.candidate);
}
