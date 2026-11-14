import type { ObjectId } from "mongodb";
import type { CountryId } from "../../constants/countries";

export type PartyLeadershipTitleKey = "chair" | "viceChair" | "treasurer";
export type PartyLeadershipTitles = Partial<Record<PartyLeadershipTitleKey, string | null>>;

/**
 * A single Shadow Cabinet appointment — the character
 * the Leader of the Opposition has named to shadow one cabinet post. A member
 * of the sitting Opposition Leader's shadow cabinet earns +1 action per turn
 * (see `SHADOW_CABINET_ACTION_BONUS`); no other mechanical effect. Stored in
 * `PoliticalParty.shadowCabinet`, keyed by cabinet position id.
 */
export interface ShadowCabinetAppointment {
  /** Appointed character's id. */
  characterId: ObjectId;
  /** Denormalized name so the hub renders without a characters join. */
  characterName: string;
  /** When the sitting Opposition Leader made the appointment. */
  appointedAt: Date;
}

export interface PoliticalParty {
  _id: ObjectId;
  /** Sequential ID for URLs - unique per country (e.g., /parties/1?country=us) */
  sequentialId: number;
  countryId: CountryId;
  /** Transient cross-process territory writer claim. Cleared by its owner in
   * finally; crash recovery requires staff reconciliation, never timed expiry.
   * Full politicalParties deletion on world reset clears abandoned claims. */
  territoryMutation?: { token: string; startedAt: Date };
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  chairId: ObjectId | null;
  viceChairId: ObjectId | null;
  treasurerId: ObjectId | null;
  /** Optional display-only titles; absent or null values use the country default. */
  leadershipTitles?: PartyLeadershipTitles;
  /**
   * Up to 3 chair-assigned campaigner characters. Campaigners gain auth to
   * spend party PS to Build Org on any state-party row owned by this party.
   * NPP Management / Move / Recruitment stay chair / vice-chair / admin.
   *
   * Assigned in the Chair's Office UI; chair-only assignment (vice-chair
   * cannot reassign campaigners). Default: empty array.
   */
  campaignerIds?: ObjectId[];
  committeeIds: ObjectId[];
  memberCount: number;
  /** Seed-owned designation; gameplay cannot rename this party or its abbreviation. */
  isDefault: boolean;
  createdBy: ObjectId | null;
  treasury: number;
  nationalTaxRate: number;
  /**
   * Political Strength reserve: grows from flat passive gain plus treasury-driven spend; capped solely by `politicalStrengthCap`. Spent on party actions via `spendPoliticalStrength`, which also tracks per-geography pressure escalation.
   */
  politicalStrength: number;
  /**
   * Optional override for the per-party PS cap. When unset, the cap derives
   * from the party tier: Major → the flat `NATIONAL_PS_CAP`; Minor →
   * `minorPartyPsCap(earnedRegions, NATIONAL_PS_CAP)`. Override exists for
   * future per-party adjustments (e.g. a charter perk).
   */
  politicalStrengthCap?: number;
  /**
   * Chair-set per-turn budget for explicit PS investment, on top of the flat
   * passive (national 20 / state 5). Each turn, `min(budget, treasury)` is
   * debited and converted to PS at `psInvestmentRate(countryId, scope)`, capped
   * at `+PS_INVESTMENT_MAX_TIERS` PS/turn. Near the cap only the PS that fits is
   * bought and charged. Treasury at `0` only zeroes the spend stream; the flat
   * passive is still paid.
   *
   * Defaults to `0` (off). See `partyActionGeneration` for the math.
   */
  psInvestmentBudget?: number;
  /**
   * Dedicated NPP Action Points pool (national scope). Banked, regenerates a
   * flat passive per turn (tier-scaled) up to `nppActionPointCap("national",
   * tier)`. Sole currency for NPP Recruitment (5 AP) and NPP Management (1 AP).
   * `undefined` on legacy rows is treated as a full pool until the next regen
   * heals it. See `src/lib/npp/actionPoints.ts`.
   */
  nppActionPoints?: number;
  /**
   * Priority Region cluster — 2–3 adjacent states / regions where this party
   * gets a `+25%` effectiveness bonus on direct national PS actions. Locked
   * for `168 turns` once set.
   *
   * The lock survives chair turnover; ineligible states are auto-evicted by
   * the per-turn validator but the slot stays empty until cooldown expires.
   *
   * See plan §"Phase 3 — Decisions Recorded During Execution" D6.
   */
  priorityRegion?: {
    stateIds: string[];
    setAtTurn: number;
    setBy: ObjectId;
  };
  /** NPP recruitment cooldown end (Date). Legacy fallback for the cooldown check. */
  nppRecruitmentCooldownUntil?: Date;
  /** NPP recruitment cooldown end turn (currentTurn + 24). Turn-first source. */
  nppRecruitmentCooldownUntilTurn?: number;
  /**
   * `ukPartyConferences._id` whose payoff credited this party's PS reserve.
   * Set atomically with the `$inc` so replays and concurrent callers cannot
   * double-credit. Absent = never credited (covers all legacy rows).
   */
  lastConferencePayoffId?: string | null;
  /** Turn on which the last member purge was executed. Used to enforce the cooldown. */
  lastPurgeAtTurn?: number;
  /** Number of consecutive purges executed by the chair (resets after cooldown expires). */
  purgeCount?: number;
  heroImageUrl?: string;
  logoUrl?: string;
  discordInviteUrl?: string | null;
  /** Game turn of formation for autonomous election-entry maturation. */
  createdTurn?: number;
  /** Legacy saves preserve earned maturity without inventing a birth turn. */
  nppElectionMatureAtTurn?: number;
  createdAt: Date;
  updatedAt: Date;
  /** Idempotency keys of money moves already applied to this party. */
  appliedMoneyFlowKeys?: string[];
  /** Coalition this party belongs to, if any */
  coalitionId?: ObjectId | null;
  /** Set when this party has merged into another party and no longer exists as an active party */
  isDefunct?: boolean;
  defunctAtTurn?: number;
  mergedIntoPartyId?: ObjectId;
  /** Set on a party created by NPP party renewal: how and when it formed. */
  renewalOrigin?: {
    kind: "splinter" | "founding";
    cycle: number;
    /** Splinter parent's sequential id. */
    parentPartyId?: string;
  };
  /**
   * Presidential primary calendar family. Determines wave schedule + delegate table.
   * Built-in parties (democrat/green/progressive/dem-socialist → "dem",
   * republican/libertarian/reform → "gop") ignore this field and use their hardcoded
   * assignment. Custom parties set this explicitly; unset falls back to economicPosition sign.
   */
  primaryCalendar?: "dem" | "gop";
  /**
   * How national leadership elections are decided.
   * "party"     = all members, one vote each (default)
   * "committee" = committee members + national leadership only, one vote each
   * "influence" = all members, votes weighted by character partyInfluence
   */
  leadershipElectionMethod?: "party" | "committee" | "influence";
  /** Custom election duration in turns (168–420). Falls back to NATIONAL_ELECTION_DURATION_TURNS when unset. */
  customElectionDurationTurns?: number;
  /**
   * Per-axis lockedUntilTurn for `positionShift` CommitteeProposals.
   * When a positionShift on an axis passes, that axis is locked for
   * `POSITION_SHIFT_COOLDOWN_TURNS` (336) before another positionShift
   * on the same axis can be proposed. Each axis tracks independently
   * so a passed `social` shift does not lock `economic`.
   *
   * Absent map / absent axis entry = unlocked. No migration needed.
   */
  positionShiftCooldowns?: {
    economic?: { lockedUntilTurn: number };
    social?: { lockedUntilTurn: number };
  };
  /**
   * Per-type lockedUntilTurn for non-positionShift CommitteeProposals.
   * When a non-positionShift proposal passes, that type is locked for
   * `PROPOSAL_COOLDOWN_TURNS` (96) before another of the same type can
   * be proposed. Independent per-type: a passed `rename` does not
   * block `merge`.
   */
  proposalCooldowns?: {
    rename?: { lockedUntilTurn: number };
    merge?: { lockedUntilTurn: number };
    electionMethod?: { lockedUntilTurn: number };
    electionDuration?: { lockedUntilTurn: number };
    removeOfficeHolder?: { lockedUntilTurn: number };
    transactionApprovalMode?: { lockedUntilTurn: number };
  };
  /**
   * Transaction approval mode for "Send to Member" and "Transfer to
   * State Party" actions. "double" (default) writes a
   * `pendingTreasuryTransactions` row requiring Treasurer + Chair/VC
   * to both approve before the underlying transfer executes. "single"
   * auto-approves on propose (immediate execution, matches pre-2026-
   * 05-22 behavior).
   *
   * Toggled via the `transactionApprovalMode` CommitteeProposal.
   * Default-party seeds and chartered-party ratification both set
   * "double". Absent value on legacy rows is treated as "double" so
   * the new default lights up retroactively on next read.
   */
  transactionApprovalMode?: "single" | "double";
  /**
   * Regime status when the country's governmentType is "onePartyState".
   * - "ruling": the single party allowed to form government, field executive
   *   candidates, trigger VONC, invite coalitions. At most one per country.
   * - "approved": tolerated minor party; full legislative participation but
   *   blocked from forming government.
   * - "banned": inert; seats vacated when flipped mid-game.
   * - null: always null when governmentType !== "onePartyState".
   * Authoritative at runtime; CountryConfig.rulingPartyId is seed-time only.
   */
  regimeStatus?: "ruling" | "approved" | "banned" | null;

  /**
   * Party tier (D5, 2026-06-18) — drives the national PS cap + the player-facing
   * Major/Minor badge. Custom parties start `"minor"`; default parties are
   * seeded per country/era. Recomputed each turn by the tier turn-phase:
   * Minor → Major on ≥20% Org in ≥⌈regions/3⌉ regions; Major → Minor after the
   * `majorDemotionWarning` countdown expires. Undefined on legacy rows until the
   * heal runs — readers fall back via `resolvePartyTier` (default-party = major,
   * custom = minor). See `src/lib/parties/partyTier.ts`.
   */
  tier?: "major" | "minor";

  /**
   * Regions (state ids) where this party currently "earns" +`MINOR_PARTY_PS_CAP_PER_REGION`
   * toward its Minor PS cap — i.e. it reached ≥20% Org there and has not since
   * dropped below 10% (hysteresis). Maintained by the tier turn-phase via
   * `updateEarnedRegions`. Drives the Minor cap; ignored while Major.
   */
  psCapEarnedRegions?: string[];

  /**
   * Active Major→Minor demotion warning. Set when the party falls below 10% Org
   * in ≥⌈2·regions/3⌉ regions; cleared when it regains the graduation condition.
   * The National Party page surfaces the countdown (`startedTurn +
   * MAJOR_DEMOTION_GRACE_TURNS − currentTurn`). Absent = not at risk.
   */
  majorDemotionWarning?: { startedTurn: number };

  /**
   * Membership gate. "open" or absent — a join takes
   * effect immediately. "approval" — a join instead files a pending request in
   * `pendingJoinRequests` for a party leader (chair, or acting vice-chair when
   * the chair seat is vacant) to accept or decline. Mirrors the coalition
   * join-request flow.
   */
  membershipMode?: "open" | "approval";
  /**
   * Pending character join requests, populated only while `membershipMode` is
   * "approval". A leader's accept sets the requesting character's `party` and
   * clears the entry; a decline just clears it. Mirrors `CoalitionJoinRequest`.
   */
  pendingJoinRequests?: PartyJoinRequest[];
  /**
   * Shadow Cabinet appointments. When this party's
   * chair is the resolved Leader of the Opposition, they may name characters to
   * shadow versions of the country's cabinet posts. Keyed by cabinet position
   * id (from the country's parliamentary cabinet config); each value records
   * the shadow appointee.
   *
   * Display / roleplay only — no mechanical or gameplay effect, and never read
   * by the turn engine. Appointment and clearing are gated to the sitting
   * Opposition Leader by the shadow-cabinet route
   * (`/api/country/[code]/executive/shadow-cabinet`). Absent on parties that
   * have never named a shadow cabinet.
   */
  shadowCabinet?: Record<string, ShadowCabinetAppointment>;
}

/**
 * A character's pending request to join an approval-gated party (suggestion
 * #72). Mirror of `CoalitionJoinRequest`, keyed on the requesting character.
 */
export interface PartyJoinRequest {
  /** Character requesting to join. */
  characterId: ObjectId;
  /** Requesting character's display name at request time (survives rename). */
  characterName: string;
  requestedAt: Date;
}
