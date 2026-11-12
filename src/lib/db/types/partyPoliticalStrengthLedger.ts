import type { ObjectId } from "mongodb";
import type { CountryId } from "../../constants/countries";

/**
 * Source of a `partyPoliticalStrengthLedger` row.
 *
 * - `passive` per-turn +1 from `partyActionGeneration`.
 * - `treasury` country-normalized treasury gain, capped by headroom.
 * - `spend` debit from `spendPoliticalStrength` when an action consumes PS.
 * - `decay` reserved slot for future PS decay rules.
 */
export type PartyPoliticalStrengthSource = "passive" | "treasury" | "spend" | "decay";

/**
 * Audit-trail row for a single PS reserve movement on a Party or
 * StatePartyOrg document. Written inline by the `partyActionGeneration`
 * processor and the `spendPoliticalStrength` command.
 *
 * `stateId` is set when the row tracks a state-party PS movement (national
 * party actions in a specific state still write `stateId` so the
 * per-geography pressure ladder has a foreign key into the geography).
 *
 * See plan §"Phase 3 — Decisions Recorded During Execution" D2 + Phase 0.5
 * §5.6 distinction.
 */
export interface PartyPoliticalStrengthLedgerRow {
  _id: ObjectId;
  countryId: CountryId;
  partyId: string;
  /** Set when the movement is tied to a specific state. National-only rows leave it unset. */
  stateId?: string;
  turn: number;
  source: PartyPoliticalStrengthSource;
  /** Signed change in PS — positive for gains, negative for spends / decay. */
  delta: number;
  /** Resulting PS value after the change. Audit redundancy. */
  value: number;
  /**
   * When `source === "spend"`, the action key (matches the API route slug
   * — `org-building`, `influence`, `recruitment`, `contest`, etc.). Unset
   * for passive / treasury / decay rows.
   */
  action?: string;
  /**
   * When `source === "spend"`, the geography key the spend escalated. For
   * national actions in a specific state this matches `stateId`; for purely
   * national actions (Phase 3 has none, but kept for future) this is unset.
   */
  geography?: string;
  createdAt: Date;
}
