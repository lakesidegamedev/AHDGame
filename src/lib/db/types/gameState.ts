import type { EuroMonetaryUnion } from "@/lib/currency/euro/rules";
import type { ObjectId } from "mongodb";
import type { CountryId, CountryStatus } from "../../constants/countries";
import type { TurnPhaseTelemetryMap } from "./turnPhaseTelemetry";
import type { ResetSystem, ResetSystemSeedReceipt } from "../../resetVersions/rules";

export type NppEntryViabilityMode = "off" | "observe" | "enforce";

export type IterationType = "Alpha" | "Beta" | "Iteration";

/**
 * Smarter-NPP autonomy tier. The level says WHICH activities autonomous
 * politicians may perform, never how competently. Competence is
 * `SingleplayerConfig.difficulty` (local worlds only), a separate axis that
 * never unlocks or removes an activity.
 *
 *   - off: no autonomy anywhere.
 *   - v0:  shipped baseline (chair, stalled-PM, bill sponsorship/voting,
 *          intl-org votes) in non-player countries.
 *   - v1:  v0 + governing brain (agenda -> executive -> cabinet -> ministerial
 *          action -> fiscal -> opposition) in non-player countries.
 *   - v2:  v1 + comingling with player-enabled countries / player corps.
 *   - v3:  v2 + full player-parity agency (career/economic loop: campaign,
 *          fundraise, run for and win office, legislate, manage personal
 *          finance). Acts in player-enabled countries like v2.
 *   - v4:  v3 applied globally (player-enabled countries included), with
 *          tighter player-country sponsorship throttles.
 *   - v5:  v4 + persistent governing goals: a government keeps a bounded set of
 *          goal records across agenda recomputes, grades each one, feeds the
 *          verdicts into the next agenda, and holds commitments instead of
 *          re-deciding every cycle. Adds no new lever; every V5 intent runs
 *          through the same validation/execution paths v4 uses.
 *   - v6:  v5 + NPP engine 6 behavior (see `nppAutonomy/engineVersion.ts` and
 *          content/changelog/npp/). Engine 6 changes how well NPPs pursue the
 *          v5 activities and what they cost to run, never what they are allowed
 *          to do or how many resources they get. The running engine version is
 *          stamped on each turn log as `nppEngineVersion`.
 */
export type NppAutonomyLevel = "off" | "v0" | "v1" | "v2" | "v3" | "v4" | "v5" | "v6";
export type NppForeignPolicyMode = "off" | "shadow" | "active";
export type NppForeignPolicyStage = "votes" | "proposals" | "trade" | "support" | "war";

/** Local-only world mode. Hosted worlds never persist these fields. */
export type SingleplayerMode = "normal" | "head-of-state" | "worldsim";
export type SingleplayerDifficulty = "easy" | "normal" | "hard";

/**
 * Progress of the first-game guide for one local world. The object's presence
 * means the world offers the guide; worlds saved before it existed have no
 * field and never see it. A new world writes a fresh object, so it is offered
 * again.
 */
export interface SingleplayerGuideState {
  /** The player closed the guide. It does not return for this world. */
  dismissedAt?: Date;
  /** The player opened the inbox (the guide's only page-visit step). */
  inboxOpenedAt?: Date;
}

export interface SingleplayerConfig {
  mode: SingleplayerMode;
  difficulty: SingleplayerDifficulty;
  /** Existing NPP autonomy level remains independent from local difficulty. */
  nppAutonomyLevel: NppAutonomyLevel;
  featureFlags: Record<string, boolean>;
  /** Whether the local character is locked to the head-of-state career path. */
  permanentHeadOfState: boolean;
  /** Explicit consent for durable, per-turn long-horizon telemetry. */
  longHorizonTelemetryEnabled?: boolean;
  /** First-game guide for a new normal-mode world. See SingleplayerGuideState. */
  guide?: SingleplayerGuideState;
  configuredAt: Date;
}

export interface GameIteration {
  type: IterationType;
  number: number;
}

/**
 * Shared stamp fields written onto office-history records (cabinet/leadership
 * holders + confirmed nominations) so generated wiki office pages can group
 * tenure by iteration and render in-game Week/Year that stays correct across
 * resets. Stamped by `freezeOfficeHistoryIterations` (and the backfill
 * migration); `confirmedTurn` is derived from the record's timestamp.
 */
export interface IterationStampFields {
  iteration?: GameIteration;
  confirmedTurn?: number;
  iterationStartingYear?: number;
}

export interface GameState {
  /** Set only after the stock holding and capital-gains migration completes. */
  stockHoldingTaxStartTurn?: number;
  /**
   * First turn of the pass-through tax reform: owners are taxed on their full
   * share of pass-through profit, phased in over 24 turns. Unset = legacy.
   */
  passThroughOwnerTaxStartTurn?: number;
  /**
   * First turn NPP CEOs are paid and level up. Pay reviews start no earlier
   * than 24 turns after it, so owners see the first demand coming.
   */
  nppCeoPayStartTurn?: number;
  /** World-local activation boundary for the twelve-turn hardware input reduction. */
  hardwareInputReliefStartTurn?: number;
  /** Unique world identity for replay receipts; replaced on each reset. */
  worldEpochId?: string;
  /** Stable start timestamp for filtering retained event archives by world. */
  worldEpochStartedAt?: Date;
  /** Written before journal-enabled population planning, distinguishing legacy crash recovery. */
  demographicFlowAttempt?: { worldEpochId: string; turn: number };
  /**
   * Funded-market cutover: the applied producer opening conversion (world,
   * last legacy turn, plan digest). Stamped last by applyProducerOpening; the
   * funded producer path refuses to start without it. Cleared on reset.
   */
  producerOpening?: { worldEpoch: string; turn: number; digest: string };
  /**
   * Economy-only reset progress (scripts/migrations/resetEconomyOnly.ts): the
   * approved plan digest and the phases already applied, so a retried apply
   * resumes instead of repeating. Cleared on a full world reset.
   */
  economyReset?: import("@/lib/admin/economyReset/types").EconomyResetMarker;
  /**
   * Snapshot of media regulation gates used by legislation endpoints that
   * already read this document. Admin market configuration keeps it current so
   * flag-off law pickers need no additional config query.
   */
  mediaRegulationSnapshot?: {
    enabled: boolean;
    marketSystemMode: import("@/lib/market/modes").MarketSystemMode;
    commandEconomyEnabled: boolean;
  };
  europeanIntegration?: import("@/lib/internationalOrganizations/europeanIntegration/rules").EuropeanIntegrationState;

  _id: string;
  /** Setup chosen by the local singleplayer launcher; absent on hosted worlds. */
  singleplayerConfig?: SingleplayerConfig;
  /** Last compact local turn sample used by opt-in performance analytics. */
  singleplayerTurnMetrics?: {
    turn: number;
    durationMs: number;
    success: boolean;
    warningCount: number;
    slowestPhases: Array<{ phase: string; durationMs: number }>;
  };
  /**
   * Turn on which the Cold War was resolved in-game, or null/absent while it is
   * still being fought.
   *
   * DELIBERATELY NOT A YEAR. The alignment eras flip to post-cold-war at 1991,
   * but a game still contesting the Cold War in 1992 has not ended it — the
   * calendar is not allowed to decide. Nothing sets this yet; it exists so the
   * bloc designation (`resolveOrgCategory`) has an off switch the day an ending
   * is built, rather than an implicit one hanging off the date.
   */
  coldWarEndedTurn?: number | null;
  currentTurn: number;
  currentYear: number;
  /** Exact operator-selected date of this iteration's reset. */
  resetStartDate?: { year: number; week: number };
  /**
   * Calendar year of turn 1 for the active reset preset (1991, 2019, etc.).
   * When undefined (legacy rows), readers fall back to the global
   * `STARTING_YEAR` constant.
   */
  startingYear?: number;
  /**
   * Calendar year of the most recent decennial census/reapportionment (P1d-2).
   * The census phase fires in Week 1 of years ending in 0 and stamps this to
   * avoid re-firing within the same year. Absent until the first census runs.
   */
  lastCensusYear?: number;
  /**
   * Compact summary of the most recent census reapportionment (P1d-3 UI). The
   * region population route reads `deltas` to show a per-region "gained/lost N
   * House seats" notice. Absent until the first census runs.
   */
  lastCensus?: {
    year: number;
    deltas: Array<{ state: string; from: number; to: number; delta: number }>;
  };
  /**
   * Last in-game year statehood admission was evaluated, so a year is rolled
   * for at most once. The roll itself is keyed on the year and is therefore
   * idempotent, but this also spares the work on every other turn of the year.
   * Absent until the first evaluation. Only 1953-era worlds have candidates.
   *
   * @see src/lib/turn/statehood.ts
   */
  lastStatehoodYear?: number;
  /**
   * The reset-preset id that produced this game world (e.g. `"2019-default"`,
   * `"1991-default"`). Drives `canonicalTurnsForCycle` lookup of real-world
   * election years per era. Defaults to `"2019-default"` when undefined.
   */
  preset?: string;
  /** Reset choice. Missing means default; overwritten on every reset. */
  startingPartiesMode?: "default" | "none";
  /**
   * On for fresh worlds (`DEFAULT_GAME_STATE_FLAGS`) since the state GDP unit fix.
   * The commodity ledger then reads each state's GDP in anchor terms (stored
   * local-currency GDP times the preset's denomination rate) instead of the raw
   * stored figure, so GDP-driven macro demand tracks real economic size across
   * countries. Missing (every world seeded before the fix) keeps the raw
   * reading, so a live world's demand does not shift under its players.
   */
  stateGdpAnchoredDemand?: boolean;
  /**
   * Pre-iteration "founding" election phase (see foundingElections). When
   * `active`, every political nation is running a one-off full-seating election
   * to establish its starting composition, the turn counter advances normally,
   * but the displayed calendar date is PINNED to the era start (turn 1) so all
   * nations enter the real game with a fresh mandate at the same moment. Cleared
   * by `detectPreIterationComplete` once every in-scope nation has resolved.
   * Absent on normal (non-pre-iteration) worlds → behaves exactly as before.
   */
  preIteration?: {
    active: boolean;
    /** Raw `currentTurn` at which the founding phase began (always 1 today). */
    startedTurn: number;
    /** Raw `currentTurn` at which the founding phase completed. */
    completedTurn?: number;
  };
  /**
   * Additive turn offset that decouples the displayed calendar from the raw
   * turn counter: `calendarTurn = max(1, currentTurn − preIterationTurns)` (see
   * `calendarTurn()` in gameDate.ts). Zero/undefined on normal worlds (identity).
   * Stamped to `completedTurn − 1` when the pre-iteration finishes, so the
   * calendar resumes at the era start (turn 1) the moment the real game begins
   * and every canonical election anchor shifts forward by the same amount (see
   * `getCycleAnchors`), preserving the historical calendar mapping.
   */
  preIterationTurns?: number;
  /**
   * Consecutive-tenure ledger for the executive head-of-government office, per
   * country. Updated when a presidential (head-of-government) election resolves:
   * same winning party → `consecutiveTerms + 1`; party flip → reset to `{ party,
   * 1 }`. Read by the party-tenure voter-fatigue penalty in the incumbency
   * driver. `consecutiveTerms` counts terms ALREADY held (so the incumbent is
   * seeking `consecutiveTerms + 1`). Absent until the first presidential
   * resolution / backfill.
   */
  presidentialTenureByCountry?: Partial<
    Record<CountryId, { party: string; consecutiveTerms: number; lastElectionId?: string }>
  >;
  isActive: boolean;
  lastTurnProcessed: Date;
  nextScheduledTurn: Date | null;
  /**
   * Wall-clock completion of the latest market update, on a turn or quarter-hour tick.
   * Drives the "markets updated" status bar note and live chart refreshes.
   */
  lastMarketTickAt?: Date;
  pausedAt: Date | null;
  /** Human-readable reason set when the cron pauses (manual or auto). null when active. */
  pauseReason?: string | null;
  /** Discriminator for pause source. "manual" for admin pause, "auto-drift" for the 4h drift guard. null when active. */
  pauseKind?: "manual" | "auto-drift" | null;
  /**
   * Wall-clock moment the turn system was last activated by `startTurnSystem`.
   * Floors the auto-pause drift anchor: after a long pause, the very first
   * post-resume turn would otherwise see drift = entire pause duration and
   * trip the 4h guard. With this floor, drift starts counting from resume.
   * Null on legacy rows; treated as "never resumed" (no floor applied).
   */
  lastResumedAt?: Date | null;
  /** Current game iteration (e.g. Alpha 1, Beta 3) - set on reset */
  iteration?: GameIteration;
  /**
   * Ordered registry of every iteration the game has known (Alpha 1, Beta 1,
   * Beta 2, …). Drives the "always show known iterations" sections on generated
   * wiki office pages. The current iteration is always present and last. Seeded
   * by the office-history backfill migration; appended on reset and on the
   * Admin "Set Now" iteration path.
   */
  iterationHistory?: GameIteration[];
  /** When true, the wiki is hidden from non-admin users (redirects to profile) */
  wikiDisabled?: boolean;
  /** When true, player-initiated sector splits and attacks are blocked */
  corporationActionsPaused: boolean;
  /** When true, player-to-player transfers are blocked */
  playerTransfersPaused: boolean;
  /**
   * When true, each player may make one cooldown-free party move (see the join
   * route). Admin-controlled: flip on while staging a launch so players can
   * settle into a party during the pause, off at go-live. Explicit rather than
   * inferred from the pause state, because a staged launch unpauses for
   * verification turns and re-pauses, making the window indistinguishable from
   * an ordinary mid-game admin pause.
   */
  freePartyMovesOpen?: boolean;
  /** When true, the forex exchange rate system is active */
  forexEnabled?: boolean;
  /** When true, PREE offers new player random events. Default false until admin enables. */
  playerRandomEventsEnabled?: boolean;
  playerRandomEventsEnabledBy?: string;
  playerRandomEventsEnabledAt?: string;
  /** Master gate for the automatic crisis system (disasters + economic/political). */
  autoDisastersEnabled?: boolean;
  autoDisastersEnabledBy?: string;
  autoDisastersEnabledAt?: string;
  /**
   * Multiplier applied to random-tier crisis spawnChance (autoCrisisSpawn.ts).
   * Undefined/absent → 1 (production default, per-template tuned rates
   * unchanged). The headless sim sets this above 1 so crises are a more active
   * force over a long audit run than the base ~0.002-0.004/turn rates yield.
   */
  crisisSpawnChanceMultiplier?: number;
  /**
   * Smarter-NPP autonomy tier (off / v0 / v1 / v2 / v3 / v4 / v5 / v6). Replaces the
   * legacy `nppAutonomyEnabled` boolean — a legacy `true` reads as "v0" and an
   * absent field with no legacy boolean reads as "off", so an existing world is
   * never silently re-tiered. Fresh worlds seed v4; setup requests that omit the
   * level default to v4. V5 is opt-in. Below v2, autonomy acts ONLY in
   * disabled/econ-only countries; v2 comingles with player-enabled countries.
   * Resolved per country by getNppAutonomyLevelForCountry.
   */
  nppAutonomyLevel?: NppAutonomyLevel;
  /** @deprecated Use `nppAutonomyLevel`. Kept in sync (level !== "off") for back-compat readers. */
  nppAutonomyEnabled?: boolean;
  nppAutonomyEnabledBy?: string;
  nppAutonomyEnabledAt?: string;
  /**
   * NPP turnover: seated NPPs die of old age and retire from 70, replaced by a
   * younger NPP of the same party in the same office, whatever the autonomy
   * level. Absent keeps the legacy behaviour (mortality only, at V5); false
   * switches it off. Fresh worlds seed true.
   */
  nppTurnoverEnabled?: boolean;
  /**
   * NPP party renewal: in NPP-run countries a long-dominant or unpopular party
   * can splinter, an empty stretch of the ideological map can found a new
   * party, a party under 2% for two general elections folds into its nearest
   * neighbour, the seat-share incumbency shield stops growing past half the
   * seats, and a party may re-enter regions it held within two cycles.
   * Absent or false keeps the legacy frozen roster. Fresh worlds seed true.
   */
  nppPartyRenewalEnabled?: boolean;
  /**
   * Foreign-policy planner rollout. Absent defaults to shadow so autonomous
   * countries produce auditable intent without changing world state.
   */
  nppForeignPolicyMode?: NppForeignPolicyMode;
  nppForeignPolicyModeBy?: string;
  nppForeignPolicyModeAt?: string;
  /** Highest autonomous action family permitted while foreign policy is active. */
  nppForeignPolicyStage?: NppForeignPolicyStage;
  nppForeignPolicyStageBy?: string;
  nppForeignPolicyStageAt?: string;
  /** Temporary pause: the system stays enabled/configured but no new crises or
   *  disasters spawn while true. Existing crises continue to run. */
  autoCrisisPaused?: boolean;
  /** Living-conflict engine: generic phased conflicts/pandemics with per-role
   *  responses and an event broadcast bus. Default off; fail-closed at runtime. */
  livingConflictsEnabled?: boolean;
  livingConflictsEnabledBy?: string;
  livingConflictsEnabledAt?: string;
  /** Temporary freeze on NEW defence procurement. When true, no new contracts may be
   *  awarded and no pending offer may be accepted, but existing active contracts keep
   *  delivering and settling in the turn sweep, and ministers may still cancel. Mirrors
   *  `autoCrisisPaused`: the subsystem stays configured, only new activity stops. Default
   *  false (procurement open). Set to halt a live procurement-drain exploit without a deploy
   *  once this gate is live. */
  defenceProcurementPaused?: boolean;
  defenceProcurementPausedBy?: string;
  defenceProcurementPausedAt?: string;
  /** Master switch for the Cold War conflict subsystem. All Cold War features
   *  on this branch are gated behind this flag. Default false (system inert). */
  coldWarEnabled?: boolean;
  coldWarEnabledBy?: string;
  coldWarEnabledAt?: string;
  /** When true, turns run at 30-minute cycles instead of 60-minute cycles */
  fastMode?: boolean;
  /** Concurrency guard - true while a turn is being processed */
  isProcessing?: boolean;
  /** Which workflow currently owns the processing lock */
  processingKind?: "turn" | "forexMigration" | "stockTaxMigration" | "economyReset" | null;
  /** When the active turn lock was acquired; used to recover stale locks after crashed runs */
  processingStartedAt?: Date | null;
  /** The turn number currently being processed while the lock is held */
  processingTargetTurn?: number | null;
  /** Updated before each phase so a future turn can tell whether the lock is stale */
  processingHeartbeatAt?: Date | null;
  /**
   * Set by the graceful shutdown handler when a deploy interrupts a turn that had
   * already committed writes. The lock stays HELD so `shouldRecoverCrashedTurn` can
   * still see how far the turn got; this marker just tells the next cron not to serve
   * the 20-minute staleness wait first. Cleared whenever a lock is acquired.
   */
  processingAbandonedAt?: Date | null;
  /** Worker instance, pid and boot id of the process that holds the turn lock. */
  processingHolderId?: string | null;
  /** Latest automatic retry of a stopped turn: attempt, step it stopped at, outcome. */
  lastTurnRetry?: {
    turn: number | null;
    attempt: number;
    afterPhase: string | null;
    outcome: "scheduled" | "succeeded" | "failed" | "stopped" | "exhausted";
    at: Date;
    note?: string;
  } | null;
  /** Last phase name to refresh the processing heartbeat; helps debug stuck turns */
  processingPhase?: string | null;
  /** Per-phase lifecycle state for the active turn; used to debug skips, failures, and stalls */
  processingPhaseStatuses?: TurnPhaseTelemetryMap | null;
  /**
   * Bounded results of completed phases a later phase consumes, written with the
   * phase's completed status so a crash resume can restore them. Keys are
   * limited to `turnPhaseResumeResults.ts`.
   */
  processingPhaseResults?: Record<string, Record<string, unknown>> | null;
  /**
   * Turn engine that owns the in-flight turn, resolved once from
   * `gameConfig.turnEngineVersion` when the turn started and cleared when it
   * commits. A crash resume reads it back and finishes on the same engine:
   * switching engines mid-turn would apply two sets of rules to one turn.
   * Absent on an idle world and on turns that started before engines were
   * versioned (those are v1 by definition).
   */
  processingEngine?: "v1" | "v2" | null;
  /** Behaviour version of the in-flight turn's engine (e.g. "2.0.0"); stamped with `processingEngine`. */
  processingEngineVersion?: string | null;
  /** Turn on which the auto-sector seeding last fired. Guards the 48-turn interval. */
  lastAutoSeedTurn?: number;
  /**
   * Safety rollout for the realized-viability check on autonomous NPP mine
   * founding. Absent resolves to observe so existing worlds collect evidence
   * without changing placement. Only enforce can reject a candidate.
   */
  nppEntryViabilityMode?: NppEntryViabilityMode;
  nppEntryViabilityModeBy?: string;
  nppEntryViabilityModeAt?: string;
  /**
   * Capped frontier-entry experiment for state-sector coverage.
   * Absent resolves to false: the experiment is disabled by default and no
   * entry mechanics may activate without the controlled 48-turn trial plus
   * largest-supplier-failure stress evidence. The NPP entry funnel and
   * state-sector coverage evidence layer runs regardless of this flag.
   */
  frontierEntryExperimentEnabled?: boolean;
  frontierEntryExperimentEnabledBy?: string;
  frontierEntryExperimentEnabledAt?: string;
  /** Turn the extraction auto-strategy phase last acted. Guards its cadence. */
  lastExtractionAutoStrategyTurn?: number;
  /**
   * Last turn the corporation turn delivered builds in this world. A sector
   * with no `buildDeliverySettledTurn` of its own (founded during an economy
   * pause, or since a reset) catches up from here. A reset writes the turn
   * before the new world's first turn, so builds placed during the opening
   * pause land in full.
   */
  buildDeliverySettledTurn?: number;
  /**
   * NPP corporation strategy loop. DEFAULT ON: absent means enabled, so
   * existing worlds keep the behaviour they were promoted with. Only an
   * explicit `false` disables it, and disabling pins every corp to the `expand`
   * levers, which are byte-identical to the pre-strategy-loop brain.
   *
   * Unrelated to `NppAutonomyLevel`'s v5 tier despite the shared version digit —
   * this flag was the fifth iteration of the CORPORATE brain and predates the
   * autonomy ladder reaching v5. Renamed in comments/labels so the two cannot be
   * mistaken for each other; the persisted field name is unchanged.
   */
  nppCorpStrategyEnabled?: boolean;
  nppCorpStrategyEnabledBy?: string;
  nppCorpStrategyEnabledAt?: string;
  /** Master gate for the decade-gated sector tech trees. Default off. */
  sectorTechTreesEnabled?: boolean;
  sectorTechTreesEnabledBy?: string;
  sectorTechTreesEnabledAt?: string;
  /** Reset-era metrics engine. Absent and invalid values run the live v1 path. */
  /** Changes on every world reset; an opening-seed receipt is valid only for this world. */
  resetWorldId?: string;
  /** Per-system, per-world proof that v2 data was populated and verified. */
  resetVersionSeeds?: Partial<Record<ResetSystem, ResetSystemSeedReceipt>>;
  /** Admin selection for the next reset; changing it does not convert the live world. */
  resetSystemSelections?: Partial<Record<ResetSystem, "v1" | "v2">>;
  resetSystemSelectionsAudit?: Partial<Record<ResetSystem, { by: string; at: string }>>;
  metricsSystemVersion?: "v1" | "v2";
  metricsSystemVersionBy?: string;
  metricsSystemVersionAt?: string;
  /** Reset-era legislation catalog and proposal flow, including its modal. */
  legislationSystemVersion?: "v1" | "v2";
  legislationSystemVersionBy?: string;
  legislationSystemVersionAt?: string;
  /** Reset-era Cabinet portfolios, treasury, and ministerial actions. */
  cabinetSystemVersion?: "v1" | "v2";
  cabinetSystemVersionBy?: string;
  cabinetSystemVersionAt?: string;
  /** Unified live-population electorate, participation ledger, and issue salience. */
  demographicsSystemVersion?: "v1" | "v2";
  demographicsSystemVersionBy?: string;
  demographicsSystemVersionAt?: string;
  /**
   * Highest Bundestag cycle whose AMS list-seat reconciliation has completed.
   * Scopes `maybeReconcileBundestag` so each cycle reconciles exactly once and
   * a later cycle still reconciles after an earlier cycle was healed. Absent on
   * legacy rows (treated as -1 / never reconciled).
   */
  lastBundestagReconciledCycle?: number;
  /**
   * When true, the Eurozone currency union (EUR) is active for DE and IE.
   * Seeded false for pre-1999 presets (1979-default, 1991-default); all
   * modern presets seed it true. Flips to true in-game when all
   * EU_EUROZONE_MEMBERS enact an EuroAdoptionProvision bill.
   * Defaults to true when absent so existing 2019-default rows are unaffected.
   */
  eurozoneEnabled?: boolean;
  /** Value-preserving legacy-unit locks and the explicit common monetary jurisdiction. */
  euroMonetaryUnion?: EuroMonetaryUnion;
  /** Signed national bills authorizing entry, including authorizations still awaiting settlement. */
  euroAdoptionAuthorizations?: Partial<Record<CountryId, { billId: string; turn: number }>>;
  /**
   * Countries that have enacted an EuroAdoptionProvision bill. When this
   * includes all EU_EUROZONE_MEMBERS, eurozoneEnabled flips to true.
   * Seeded to ["DE", "IE"] for modern presets, [] for pre-1999 presets.
   */
  euroAdoptedCountries?: CountryId[];
  /**
   * Voting-age threshold set by enacted franchise legislation
   * (`ElectoralLawProvision.votingAge`). Absent = derive from the year:
   * 21 before the 26th Amendment, 18 after. See `resolveVotingAgeEligible`.
   *
   * GLOBAL. Retained only so worlds written before the per-country map existed
   * still resolve; nothing writes it any more. Read AFTER
   * `votingAgeEligibleByCountry`, which supersedes it.
   */
  votingAgeEligible?: number;
  /**
   * Per-country franchise, keyed by countryId. Electoral law is national law:
   * a Japanese franchise bill must not set the American voting age.
   */
  votingAgeEligibleByCountry?: Partial<Record<string, number>>;
  /**
   * Registration-access law, -50 (restricted) .. +50 (automatic registration).
   * GLOBAL legacy field, superseded by `registrationAccessBiasByCountry`.
   */
  registrationAccessBias?: number;
  /**
   * Per-country registration-access law, keyed by countryId. Scales the passive
   * Org→Reg drift and Reg decay for that country's states only.
   */
  registrationAccessBiasByCountry?: Partial<Record<string, number>>;
  /**
   * Master switch for the era system. When true, the era-crossing turn phase
   * stamps decade eras + posts wire news, and approval/metric scoring is
   * era-aware: thresholds drift with the live in-game year via era-normal
   * expectation curves (src/lib/era/). Default false — flag-off behavior is
   * byte-identical to legacy scoring and no era markers are written.
   * Toggled from Admin; flip only after reviewing the dry-run diff
   * (scripts/debug/era-approval-dryrun.ts).
   */
  eraSystemEnabled?: boolean;
  eraSystemEnabledBy?: string;
  eraSystemEnabledAt?: string;
  /**
   * Per-country GDP-per-capita baseline for the era income band (metric era
   * catalog). Self-healed by computeNationalMetrics on the first flag-on turn
   * (back-solved from realized income vs the era income anchor — continuity:
   * no score jump at enable). Local-currency base units.
   */
  eraGdpPerCapitaBaseline?: Partial<Record<string, number>>;
  /**
   * Per-country realized-growth index (current GDP/capita ÷ baseline), written
   * each turn by computeNationalMetrics while eraSystemEnabled. Consumed by
   * medianIncome scoring (band = anchor × shape × index).
   */
  incomeBandIndexByCountry?: Partial<Record<string, number>>;
  /**
   * Per-country income vintage provenance: the start-year vintage id this
   * world's median incomes were seeded or migrated with. Written only by the
   * seed writer that writes those values (or a reviewed migration that rewrites
   * them); medianIncome scoring uses the vintage anchor only on a match, and
   * absent means legacy data on the legacy anchor. Cleared on reset.
   */
  incomeStartVintages?: Partial<Record<string, string>>;
  /**
   * Player-facing decade era id ("2000s"), stamped by the era-crossing turn
   * phase at decade rollover. Display/news only — scoring never reads it
   * (scoring computes continuously from currentYear).
   */
  currentEraId?: string;
  /** Decade year the era-crossing phase last fired for (guards re-fire). */
  lastEraCrossedYear?: number;
  /**
   * Year the metric-activation news check last covered (guards re-posting).
   * First flag-on run quietly self-heals to the current year without posting.
   */
  lastMetricActivationYear?: number;
  /**
   * Guard year for the cabinetYearCrossing turn phase (seat unlock/retire/rename
   * vs the live year). First run quietly self-heals: reconciles retired-occupied
   * seats and stamps without posting news.
   */
  lastCabinetYearProcessed?: number;
  /**
   * Guard year for the militaryBranchYearCrossing turn phase (standing up a service
   * whose `establishedYear` the world has now reached, e.g. the NVA in 1956). First
   * run quietly stands up every active-but-empty branch and stamps without posting.
   */
  lastMilitaryBranchYearProcessed?: number;
  /** 1991-world Hungarian Assembly resized from 386 to 199 seats in 2014. */
  huAssemblyReformedAtYear?: number;
  /**
   * Cabinet seat ids brought into existence early by a create_department bill,
   * regardless of their era `yearEnabled` (e.g. "secretary_of_education" after the
   * Department of Education Act). Read by rosterEra.isSeatActive / resolveSeatName.
   */
  manuallyEnabledSeats?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-country game state for multi-country support.
 * Tracks electoral cycle timing independently per country.
 * US uses the global GameState; additional countries use CountryGameState.
 */
export interface CountryGameState {
  /** Country ID - acts as document _id */
  _id: CountryId;
  /** JP 1991: approved 1994 Shugiin reform applies to later elections only. */
  jpShugiinElectoralMandate?: {
    law: "mixed-1994-v1";
    passedTurn: number;
    billId: string;
  };
  /** Latest successfully resolved Shugiin rule/capacity per region. */
  jpShugiinResolvedRegionalRules?: Record<
    string,
    {
      ruleVersion: "sntv-1991-v1" | "mixed-1994-v1";
      totalSeats: number;
      districtSeats: number;
      listSeats: number;
      electionId: string;
      cycle: number;
      resolvedAtTurn: number;
    }
  >;
  /** HU 1991: enacted 1994 electoral amendment, never inferred from the year. */
  huElectoralLaw1994SinceTurn?: number;
  /** A bound parliamentary decision authorizes the later Hungarian electoral system. */
  huElectoralSystem2011SinceTurn?: number;
  /** BG 1991: raw turn when the elected 240-seat ordinary Assembly replaced the Grand Assembly. */
  bgOrdinaryAssemblySinceTurn?: number;
  /** Optional for existing settlements; only a recorded constituent vote authorizes new ordinary rules. */
  bgConstitution1991SinceTurn?: number;
  /** Explicit alternate transition retains the400-seat chamber until its original term ends. */
  bgGrandAssemblyContinuationSinceTurn?: number;
  /** Separate enacted ordinary vote ends an explicitly continued constituent chamber. */
  bgGrandAssemblyDissolutionSinceTurn?: number;
  /** RO 1991 world: raw turn when the 341/143 parliament replaced the 396/119 constituent chambers. */
  roParliament1992SinceTurn?: number;
  /** Bound bicameral enacted decision, separate from the completed chamber handover. */
  roElectoralLaw1992SinceTurn?: number;
  /** RU 1991: ratified succession changed the playable RU slot from USSR to Russia. */
  ruSovietSuccessionSinceTurn?: number;
  /** Retained district capacity of the negotiated provisional Russian Congress. */
  ruProvisionalCongressSeats?: number;
  /** RU 1991: enacted authority to establish the post-Soviet presidential office. */
  ruPresidencyMandateSinceTurn?: number;
  /** RU 1991: the first presidential election has a certified result. */
  ruPresidencyElectionCertifiedSinceTurn?: number;
  /** Bound result journal of the latest certified Russian presidential ballot. */
  ruPresidencyCertifiedElectionId?: ObjectId;
  /** First direct Russian ballot opened under the bound constitutional mandate. */
  ruPresidencyFirstElectionId?: ObjectId;
  /** RU 1991: enacted authority to replace Congress with the Federal Assembly. */
  ruFederalAssemblyMandateSinceTurn?: number;
  /** Bound first-Duma election cohort; opening it does not retire Congress. */
  ruFirstDumaElectionCohortId?: ObjectId;
  /** Optional enacted Duma electoral law; existing and repeat ballots stay frozen. */
  ruDumaElectoralMandate?: {
    law: "law1995";
    proposalId: string;
    revision: number;
    sinceTurn: number;
  };
  /** Optional enacted Council formation law; existing first roots remain immutable. */
  ruCouncilFormationMandate?: {
    mode: "regionalHeads" | "regionalDelegates";
    proposalId: string;
    revision: number;
    sinceTurn: number;
  };
  /** Installed regional composition, separate from the first elected Council. */
  ruCouncilComposition?: {
    mode: "regionalHeads" | "regionalDelegates";
    proposalId: string;
    revision: number;
    sinceTurn: number;
    receiptId: string;
  };
  /** Latest ordinary Duma campaign; first-election roots remain immutable. */
  ruDumaConvocationCohortId?: ObjectId;
  /** Latest actually seated ordinary Duma, independent of an open successor campaign. */
  ruDumaCurrentConvocationCohortId?: ObjectId;
  /** Bound first-Council subject cohort; opening it does not retire Congress. */
  ruFirstCouncilElectionCohortId?: ObjectId;
  /** Atomic first-Duma bounded NPC slate admission receipt. */
  ruDumaNpcAdmissionCohortId?: ObjectId;
  /** Registered parties without an eligible profile for fallback NPC nominees. */
  ruDumaUnrepresentedParties?: string[];
  /** RU 1991: the first Federal Assembly election has a certified result. */
  ruFederalAssemblyElectionCertifiedSinceTurn?: number;
  /** RU 1991: raw turn when the July presidential inauguration replaced the Chairman as head of state. */
  ruPresidencySinceTurn?: number;
  /** RU 1991 world: raw turn of the September 1993 Congress dissolution. */
  ruCongressDissolvedSinceTurn?: number;
  /** RU 1991 world: raw turn of the December 1993 first Federal Assembly. */
  ruFederalAssemblySinceTurn?: number;
  /** YU 1991: enacted mandate to settle the federation's political succession. */
  yuSuccessionMandateSinceTurn?: number;
  /** YU 1991: successor sovereignty and obligations were applied before office retirement. */
  yuSettlementAppliedSinceTurn?: number;
  currentTurn: number;
  currentYear: number;
  /** Turn on which the current electoral cycle began */
  cycleStartTurn: number;
  /** Turn on which the next general election is scheduled (if known) */
  nextElectionTurn?: number;
  /** True when a snap election has been triggered and is pending scheduling */
  snapElectionPending: boolean;
  isActive: boolean;
  lastTurnProcessed: Date;
  nextScheduledTurn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Whether non-admin players can access this country's pages and data */
  enabledForPlayers?: boolean;
  /** DB-driven country status - overrides CountryConfig.status at runtime */
  status?: CountryStatus;
  /**
   * Turn this country ceased to exist through absorption or dissolution.
   *
   * Enumeration of the country list must exclude these, or you get elections with no
   * regions and budgets over no states. A date field rather than a `CountryStatus`
   * member on purpose: `status` is read at many sites and widening its union risks
   * silent behaviour changes. This is additive, and the two enumeration chokepoints
   * are the only readers.
   *
   * Retirement is not deletion. Documents stay for history, the wiki, and future
   * restoration; the country simply stops being simulated.
   */
  dissolvedTurn?: number | null;
  /**
   * True when this country does not exist as a polity in the world's current
   * preset era (e.g. East Germany in 1991, Czechoslovakia in 2019).
   *
   * DELIBERATELY NOT `dissolvedTurn`. That field means "absorbed into another
   * country" and drives merge idempotency: `mergeCountry` treats any row
   * carrying it as retired and refuses it as a merge target. A country absent
   * from an era was never absorbed, so stamping a dissolution would silently
   * no-op a genuine later merge.
   *
   * Written true OR false by `seedCountryGameStates` on every reset, never
   * only-when-true, so a world moving 1991 -> 1953 brings the country back.
   * Optional: absent reads falsy, matching prior behaviour, so no backfill.
   */
  absentInEra?: boolean;
  /**
   * True when the world's preset holds this country outside the full simulation
   * (the `background` era-roster tier). The country stays registered, but every
   * per-country turn phase skips it and bootstrap seeds no corporations,
   * sectors, NPP politicians or full-engine elections for it.
   *
   * Optional and additive: undefined reads as full simulation, so no backfill is
   * needed. Read through `@/lib/country/countryTier`, never directly.
   */
  backgroundCountry?: boolean;
  /**
   * When true, non-admin players can view economy-only pages (map, metrics,
   * stockmarket, central bank, budget, forex) even while `enabledForPlayers`
   * is false. Political routes (elections, legislature, parties, etc.) remain
   * hidden. Used for phased country launches where the economy is live but
   * political gameplay hasn't opened yet.
   */
  economyPreview?: boolean;
  /** Turn the last automatic natural disaster fired for this country. */
  lastDisasterTurn?: number;
  /**
   * Set true by `detectPreIterationComplete` once this nation's one-off founding
   * (full-seating) election has resolved and its government has formed during a
   * pre-iteration reset. Used to detect when ALL in-scope nations are seated so
   * the pre-iteration can end. Absent/false on normal worlds. (The US uses the
   * global GameState, so its founding-resolution is tracked separately there.)
   */
  foundingCycleResolved?: boolean;
  /**
   * Last Tier-1 NPP strategic decision cycle claimed for this country.
   * Cycle index is `floor((turn - 1) / 6)`. Claim-before-act prevents a
   * restarted worker from double-firing the same six-hour bucket.
   */
  lastNppStrategicDecisionCycle?: number;
}

export type ActionType =
  | "fundraise"
  | "campaign"
  | "advertise"
  | "buildDonorBase"
  | "poll"
  | "pollLarge"
  | "convertCash"
  | "rest"
  | "debatePrep";

export interface ActionLog {
  _id: ObjectId;
  characterId: ObjectId;
  userId: ObjectId;
  actionType: ActionType;
  targetState?: string;
  actionCost: number;
  result: {
    success: boolean;
    fundsChange?: number;
    politicalInfluenceChange?: number;
    favorabilityChange?: number;
    infamyChange?: number;
    donorBaseLevelChange?: number;
    cashOnHandChange?: number;
    politicalMediaOrderId?: string;
    message: string;
  };
  turn: number;
  createdAt: Date;
  /** Denormalized identity (set at write time post-2026-05-31; backfilled on deletion). */
  characterName?: string;
  username?: string;
  countryId?: CountryId;
  /** Set when the owning character/account is deleted; row is retained, not purged. */
  characterDeletedAt?: Date;
}
