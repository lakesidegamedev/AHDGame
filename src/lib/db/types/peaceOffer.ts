import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { PeaceTerm } from "@/lib/military/peaceTerm";

export type PeaceApplicationPhase = "claimed" | "term_applied" | "completed";

export interface PeaceApplicationPlan {
  /** Durable progress marker used to resume an interrupted acceptance safely. */
  phase: PeaceApplicationPhase;
  acceptedBy: string;
  acceptedTurn: number;
  /** Frozen before any roster edits, so retries never infer a different settlement. */
  leavers: Array<{ countryId: CountryId; side: "A" | "B" }>;
  trucePairs: Array<{ first: CountryId; second: CountryId }>;
  resolutionWinner: "A" | "B" | "stalemate" | null;
  attackerNation: CountryId;
  defenderNation: CountryId;
}

/**
 * Turns a truce holds between two countries after ANY war between them ends —
 * negotiated or won outright.
 *
 * Not a negotiated term: neither party can trade it away. It stops a country that
 * has just been beaten being re-declared on the moment the attacker's 120-turn
 * declaration cooldown lapses, at the point it is least able to resist.
 */
export const TRUCE_TURNS = 240;

/**
 * Turns a peace offer stands before it lapses. Fixed rather than player-chosen: one
 * less thing to explain, and a duration nobody picks cannot be picked badly.
 */
export const PEACE_OFFER_DURATION_TURNS = 72;

/**
 * A bilateral offer to end one country's participation in one war.
 *
 * Struck between two COUNTRIES, not two sides: the leaver drops off its side's
 * roster and the war continues for everyone else. That follows the consent rule
 * already shipped for coalition offensives — no player commits another player's
 * army — and avoids whole-side peace's failure mode, where one inactive country on a
 * roster could never consent and would freeze the war permanently.
 */
export interface PeaceOfferDoc {
  _id: ObjectId;
  /** The war being exited (ConflictDoc._id). */
  conflictId: string;
  fromCountry: CountryId;
  toCountry: CountryId;
    /**
   * Which party this deal takes OUT of the war. Always `fromCountry` or
   * `toCountry`.
   *
   * Explicit rather than implied because offers run in both directions:
   * `leaver === fromCountry` means "let me out"; `leaver === toCountry` means
   * "you get out" and the sender stays in, peeling a coalition apart by
   * negotiation. The RECIPIENT always accepts or refuses, so nobody is removed
   * from a war without their own government agreeing.
   */
  leaver: CountryId;
  /**
   * What this settlement takes. Exactly ONE term, enforced by the union rather
   * than by the UI: a discriminated union makes a deal carrying two terms
   * unrepresentable, so it cannot be stored or hand-rolled over the API.
   *
   * An indemnity is one branch of the union, and `amount: 0` is a clean white
   * peace, the same mechanism dialled to nothing. Its `payer` stays explicit
   * because EITHER party may pay: a losing country buys its way out, and a
   * winning country may pay to disengage. That amount is ALWAYS quoted in the
   * payer's local currency, since every treasuryBalance is denominated locally.
   */
  term: PeaceTerm;
  /** Optional note, moderated. Public on the conflict record once accepted. */
  justification?: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "expired";
  offeredTurn: number;
  /** Always `offeredTurn + PEACE_OFFER_DURATION_TURNS`; not player-set. */
  expiresTurn: number;
  /** characterId of whoever made the offer. */
  offeredBy: string;
  /** characterId of whoever accepted or rejected it. */
  resolvedBy?: string;
  resolvedTurn?: number;
  /**
   * Present on acceptances created by the resumable settlement pipeline. Legacy
   * accepted offers omit it and are treated as already completed.
   */
  application?: PeaceApplicationPlan;
}
