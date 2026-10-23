/**
 * Whether a money audit envelope is kept in `actionAuditLog`.
 *
 * Every money leg used to be written twice: once to `financialTxLog` (the
 * forensic ledger) and once to `actionAuditLog` (the alt-detection spine).
 * On production that second copy was ~54,000 inserts per turn, 36 MB, into a
 * collection with fifteen indexes including a text index, and the anomaly scan
 * that consumes it already excludes system-actor rows in Mongo because
 * materialising them blew the heap watchdog (#3366). The mirror was pure
 * write amplification on the turn's critical path.
 *
 * The rule now:
 *  - a player/NPP/admin actor keeps a full mirror (that is what alt detection
 *    reads), and
 *  - a system-actor leg is mirrored only when a detector can use it: related
 *    supply-agreement settlements, party funding, and anything with a party
 *    counterparty. Everything else lives only in `financialTxLog`, which is
 *    where the money trail already is.
 *
 * `AUDIT_MIRROR_SYSTEM_MONEY=1` restores the old full mirror without a code
 * change if a forensic investigation needs it.
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
