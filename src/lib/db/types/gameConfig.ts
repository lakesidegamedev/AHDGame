import type { EconomicInterventionPlan } from "@/lib/economy/interventionGovernance";

export interface GameConfig {
  _id: string;
  /**
   * Which turn engine processes a new turn: "v1" (default when absent) or "v2".
   * Read ONCE at turn start and stamped on the in-flight turn, so flipping this
   * never changes the engine of a turn already in progress; rollback is setting
   * it back to "v1" between turns. Unknown values fall back to "v1" with a
   * warning on the turn log. See `src/simulation/engine/turnEngine.ts`.
   */
  turnEngineVersion?: "v1" | "v2";
  /** Enables product-project reads and output adapters; absent remains off. */
  productLinesV2Enabled?: boolean;
  /** Enables media product project reads and bounded quality/brand overlays; absent remains off. */
  mediaProductSlatesEnabled?: boolean;
  /** Shared nominal commodity price level. Scarcity remains in price/base ratios. */
  commodityNominalPriceIndex?: number;
  /** Last commodity turn included in commodityNominalPriceIndex. */
  commodityNominalPriceIndexTurn?: number;
  /**
   * Outcome of the most recent reset. Makes a SEALED world interpretable: an
   * admin who did not watch the SSE stream can tell "fresh world awaiting your
   * verification" from "the reset died in teardown".
   *
   * ⚠️ Safe to live here because `gameConfig` is manifest category `reference`
   * (teardown sweeps only `getRuntimeCollectionNames()`) and `runSeed` no
   * longer drops the collection — see B2. If either changes, this is lost.
   */
  lastReset?: {
    runId: string;
    status: "running" | "succeeded" | "partial" | "failed";
    phaseReached?: string;
    at: Date;
    by?: string;
  };
  /**
   * This world's OWN seed-roster upkeep denominators, captured at bootstrap.
   *
   * `upkeepPerTurn` divides a live roster by the roster the world STARTED with, and
   * that denominator used to be derived from current code, so editing
   * `ORDERS_OF_BATTLE` re-priced every existing army with nothing touching the world.
   * See `seedRosterUpkeepPin.ts`.
   *
   * ⚠️ Rewritten unconditionally on every reseed. `gameConfig` is manifest category
   * `reference` and survives teardown, so a pin left from the previous world would
   * otherwise hold the new one to the old world's numbers.
   */
  seedRosterUpkeep?: {
    preset: string;
    byCountry: Record<string, number>;
    capturedAt?: Date;
    note?: string;
  };
  startingFunds: number;
  startingActions: number;
  startingFavorability: number;
  startingInfamy: number;
  startingPoliticalInfluence: number;
  startingDonorBaseLevel: number;
  baseActionsPerTurn: number;
  turnLengthMinutes: number;
  /**
   * Actions bonus granted per turn for holding each elected office type.
   * Keyed by office type string (e.g. "house", "senate", "commons", "sangiin").
   * Covers every `officeTypes[].key` across all countries in `countries.ts`.
   * Central bank chair is tracked separately via `chairActionBonus` because the
   * role lives in the `centralBanks` collection, not `character.currentOffice`.
   */
  officeActionBonus: Record<string, number>;
  /**
   * Actions bonus granted per turn to the sitting central bank chair,
   * regardless of whatever elected office the character also holds.
   * Looked up from `centralBanks.chairCharacterId` during actionRefresh.
   */
  chairActionBonus: number;
  /** Discord webhook URL for all game events (elections, bills, government). Optional. */
  discordGameWebhookUrl?: string;
  /**
   * Country-specific game webhook URLs, keyed by country id. The only storage
   * for per-country webhooks; written by PATCH /api/admin/config/discord for
   * every country enabled for players.
   */
  discordCountryGameWebhookUrls?: Record<string, string>;
  /** Discord webhook URL for player news posts. Optional. */
  discordNewsWebhookUrl?: string;
  /** Discord webhook URL for changelog / patch-notes posts. Optional. */
  discordChangelogWebhookUrl?: string;
  /** Discord webhook URL for in-game player suggestions (feedback modal). Optional. */
  discordSuggestionsWebhookUrl?: string;
  /**
   * Deployment slug ({@link deploymentServiceSlug}) that owns the webhook URLs
   * above — stamped whenever an admin saves them. Every send is suppressed when
   * the running deployment does not match, so a database restored into a
   * sandbox, staging, or local world cannot post its events into the players'
   * Discord (#1208). Absent on worlds whose webhooks predate the stamp, which
   * post as before.
   */
  discordWebhookOwnerService?: string;

  /**
   * Maintenance mode, tri-state: "off" (normal), "partial" (site stays
   * browsable but registration/character-creation are blocked), "full"
   * (non-admin users are redirected to /maintenance on every page). Legacy
   * boolean docs already in prod (`true`/`false`) are still valid — resolve
   * through `normalizeMaintenanceMode` (`@/lib/maintenanceStatus`), which
   * treats `true` as "full" and `false`/absent as "off". Never read this
   * field's raw value for a truthiness check; always normalize first.
   */
  maintenanceMode?: boolean | "off" | "partial" | "full";
  /** Admin-provided reason shown on the maintenance page. */
  maintenanceReason?: string;
  /** ISO 8601 timestamp for expected end of maintenance. */
  maintenanceExpectedEnd?: string;
  /** Username of the admin who enabled maintenance mode. */
  maintenanceEnabledBy?: string;
  /** When maintenance mode was last toggled on. */
  maintenanceEnabledAt?: string;

  /**
   * Site-wide poll/survey banner, shown under the navbar to every visitor
   * (signed in or not) while enabled, on every page that renders site chrome.
   * Purely an announcement surface: it reads nothing from game state and
   * drives nothing. Absent means off, so existing worlds render exactly as
   * before.
   *
   * Never read `pollBannerUrl` straight out of this document — resolve the
   * whole group through `resolvePollBannerSnapshot` (`@/lib/pollBanner`),
   * which withholds the link while the toggle is off and refuses any scheme
   * other than http/https.
   */
  pollBannerEnabled?: boolean;
  /** Ops access gate: users with `sandboxAccessGrantedAt` may reach the sandbox without supporter status. */
  sandboxTesterAccessEnabled?: boolean;
  /** Admin-authored sentence that precedes the link. */
  pollBannerMessage?: string;
  /** Admin-authored anchor text, e.g. "Click Here". */
  pollBannerLinkLabel?: string;
  /** Absolute http(s) destination for the link. */
  pollBannerUrl?: string;
  /** Colour treatment: "info" for routine, "warning" for urgent. */
  pollBannerTone?: "info" | "warning";
  /** Username of the admin who last saved the banner. */
  pollBannerUpdatedBy?: string;
  /** ISO 8601 timestamp of the last save. */
  pollBannerUpdatedAt?: string;
  /** Enable/disable NPP economic system (fund generation + action processing) */
  nppEconomyEnabled?: boolean;
  /**
   * Command-economy regime (P0 / command-lite). When true, countries in
   * `COMMAND_ECONOMY_REGIMES` for the current in-game year (USSR, command-era
   * China) are modeled as planned economies rather than market ones: a fixed
   * non-convertible official currency (no drift / chair intervention), an
   * administered inflation path (CPI pinned to the era target), a passive
   * monobank (no Taylor-rule auto-rate), and soft budget constraints (state
   * firms are exempt from insolvency dissolution). Default OFF — absent means
   * off, so existing worlds are unchanged until an operator opts in.
   * See `@/lib/constants/commandEconomy`.
   */
  commandEconomyEnabled?: boolean;
  /**
   * Management overhead, in margin points per doubling of a corporation's
   * plant count above MANAGEMENT_OVERHEAD_FREE_PLANTS. 0 or absent = off.
   */
  managementOverheadPpPerDoubling?: number;
  /**
   * Funded producer market: >= 1 plans each plant's output from expected sales
   * minus held stock, so inputs and staffing follow the plan. 0 or absent = off.
   */
  producerDemandPlanStage?: number;
  /**
   * Funded producer market: >= 1 re-clears household spend that was stranded in
   * sold-out lanes onto the household's other lanes with unsold supply, once, at
   * the same posted prices. 0 or absent = off.
   */
  producerSpilloverStage?: number;
  /** With producerSpilloverStage on: share (0 to 1) of stranded spend that substitutes. Absent = 0.7. */
  producerSpilloverShare?: number;
  /**
   * Funded producer market: >= 1 keeps a share of each public budget line's
   * unfilled money in the public wallet for the next turn (instead of burning
   * it at close), capped at four turns of the line's outlay. Support and grants
   * are paid from what is left. 0 or absent = off.
   */
  producerPublicCarryStage?: number;
  /** Share of a short line's unfilled budget kept when the stage is on. Default 0.5. */
  producerPublicCarryShare?: number;
  /**
   * Funded producer market: > 0 limits how much of last turn's run a plant may
   * shed in one turn (for example 0.15 = at most 15% a turn), so output and
   * wages follow a glut down over several turns. 0 or absent = off.
   */
  producerRunPaceDrop?: number;
  /**
   * Funded producer market: > 0 caps AI free conversions per turn at this share
   * of each country's operating capacity book value (for example 0.02). Unconverted
   * losing sectors stay in the queue for the next turn. 0 or absent = off.
   */
  producerConversionPaceShare?: number;
  /**
   * Funded producer market: > 0 keeps household income steady. Each country's
   * household transfer share is held at its first-funded-turn level, and when
   * planned household income (wages, operating payments, transfers) is under this
   * many anchor units per turn, every country's transfers rise out of its own
   * budget transfer lines until it is met. 0 or absent = off.
   */
  producerHouseholdIncomeFloor?: number;
  /**
   * Funded producer market: > 0 makes a seller mark its ask down as carried stock
   * exceeds this many turns of its recent sales (down to the market floor) and
   * write off a small share of the excess each turn. 0 or absent = off.
   */
  producerStockCover?: number;
  /**
   * Funded producer market: >= 1 floors each buyer's reference price for a
   * reachable good at the last funded clearing price (capped at 3x), so a country
   * whose lagged price signal is stale can still compete in a short market.
   * 0 or absent = off.
   */
  producerClearingReferenceStage?: number;
  /**
   * Funded producer market: >= 1 rebuilds each country's reachable book for the
   * price phase from the funded market's own orders and cross-border fills
   * instead of the modelled trade clearing. Receipts carry the seller and buyer
   * country so the book is measured, not inferred. 0 or absent = off.
   */
  producerFundedBookStage?: number;
  /**
   * Funded producer market: >= 1 pays a share of the public funding left after
   * the line carry, transition support and grants to the same country's
   * households (weighted by wages) instead of burning it at close. Nothing is
   * minted; the money is the funding the treasury outlay already paid for.
   * 0 or absent = off.
   */
  producerProcurementSpillStage?: number;
  /**
   * Funded producer market: >= 1 lets a line that sold out at a profit grow by
   * its book's measured shortage (units asked over units delivered last turn),
   * at most doubling a turn, instead of a fixed step. 0 or absent = off.
   */
  producerShortageGrowthStage?: number;
  /**
   * Funded producer market: >= 1 counts a plant's deliveries to its own
   * company's sites as sales for the demand plan and the zero-sales counter
   * (valued at its asking price for the profit test), so a captive supplier is
   * not read as idle and mothballed. Settlement is unchanged. 0 or absent = off.
   */
  producerCaptiveDeliveryStage?: number;
  /**
   * Funded producer market: >= 1 lets an AI owner reopen one mothballed plant a
   * turn whose recipe's running plants face a measured shortage (units asked
   * over delivered at least 1.5), instead of waiting on the legacy price
   * ratio. 0 or absent = off.
   */
  producerFundedRestartStage?: number;
  /** Share (0 to 1) of that leftover paid to households when the stage is on. Absent = 1. */
  producerProcurementSpillShare?: number;
  /**
   * Funded producer market: >= 1 retires, with no cash, a share of the
   * capacity of plants that have sold nothing for several turns. 0 or absent = off.
   */
  producerIdleRetireStage?: number;
  /**
   * Funded producer market transition package (classification of over-built
   * sectors at the opening, struggling marks, support and free conversion for
   * 48 turns after the switch). Absent or true = on. False = no package: an
   * economy rebuilt from the seed has nothing to land softly, so its window is
   * treated as already closed and idle retirement runs from the first turn.
   */
  producerTransitionPackageEnabled?: boolean;
  /**
   * Funded producer market: between 0 and 1, the remaining build time of each
   * outstanding order in a plant whose output is short (measured on the
   * funded book) is multiplied by this once. Absent or 1 = off. A fresh world
   * starts far short of real demand, and 24 to 96 turn builds leave it short
   * for days; the economy-only reset sets this.
   */
  producerShortageBuildFactor?: number;
  /** Funded-turn price pace: largest per-turn move of a scarcity multiplier. Absent = 0.06. */
  producerPriceMaxMove?: number;
  /** Funded-turn price ceiling: largest scarcity multiplier. Absent = 10. */
  producerPriceMaxMultiplier?: number;
  /**
   * With producerIdleRetireStage on: share (0 to 1) of the book value of retired
   * capacity paid to the owner from the country's unspent public funding.
   * Absent = 0.5. Never paid when the pool is empty.
   */
  decommissionGrantShare?: number;
  /**
   * Funded producer market: >= 1 lets a plant that sells almost nothing run
   * and staff a 1% probe instead of 10%, and cuts upkeep on parked and idle
   * capacity to a tenth. 0 or absent = off.
   */
  producerLowUseCostStage?: number;
  /** Strength upkeep rollout stage (corporations/strengthUpkeep). 0 or absent = off. */
  strengthUpkeepStage?: number;
  /**
   * State-owned corporations pay management overhead and sprawl on their
   * country's total plants and sectors, scaled by this (0 to 1). 0 or absent = off.
   */
  soeSizeCostScale?: number;
  /**
   * Running dominance cost: share (0 to 1) of the dominance margin penalty a
   * group pays every turn on plants worlds, measured on the control group's
   * share and fading to zero as that share falls to the threshold. 0 or absent = off.
   */
  dominanceRunningCostScale?: number;
  /**
   * Honest balance sheets rollout stage: 1 counts bank construction loans and
   * overdrawn cash as debt in credit and share price. 0 or absent = off.
   */
  honestBalanceSheetsStage?: number;
  /**
   * A player CEO raising their own salary above this share of trailing daily
   * net income needs a shareholder vote. 0 or absent = off.
   */
  ceoSalaryVoteNetIncomeShare?: number;
  /**
   * Funded producer path: 1 charges management overhead as points of revenue on
   * funded sectors, since the margin stack that carries it is bypassed there.
   * State-owned size cost and running dominance cost follow their own scale
   * knobs. 0 or absent = off.
   */
  fundedOverheadStage?: number;
  /**
   * Funded producer path: 1 drives sector headcount, and the regional labour
   * demand that unemployment reads, from the funded plan's staffed workers
   * instead of nameplate staffing. 0 or absent = off.
   */
  fundedHeadcountStage?: number;
  /**
   * Equity cashout limits: 1 caps the price the system equity pool pays for new
   * shares (no sentiment premium, no more than book or 15x trailing earnings per
   * share), caps one company's pool placements at its book equity per 48 turns,
   * and counts a borrower's shares in a company they control at the lower of
   * book and half the quote toward their credit line. 0 or absent = off.
   */
  equityCashoutLimitsStage?: number;
  /**
   * Market Adjustment event: 1 records each country's loss share of funded
   * capacity every turn and lets the event fire when it holds. 0 or absent = off.
   */
  marketAdjustmentStage?: number;
  /** Group size costs rollout stage (1 = management overhead on the control group, 2 = commodity build toll, 3 = dumping guard, 4 = monopoly trigger, 5 = merger concentration on the control group). 0 or absent = off. */
  groupSizeCostsStage?: number;
  /** Public media editorial stance and audience response rules. Missing means off. */
  mediaEditorialEnabled?: boolean;
  /** Paid media and entertainment operating-model catalog. Default off. */
  mediaOperatingModelsEnabled?: boolean;
  /** Media ownership limits and censorship effects in the advertising market. Default off. */
  mediaRegulationEnabled?: boolean;
  /** Who last toggled the command-economy regime. */
  commandEconomyEnabledBy?: string;
  /** When the command-economy regime was last toggled. */
  commandEconomyEnabledAt?: string;
  /**
   * Second-economy (black-market) tolerance lever, 0 (full repression) → 1
   * (tolerated). Higher tolerance lets the informal economy grow and absorb more
   * monetary overhang (lower shadow premium) at the cost of more leakage from the
   * plan. Absent → 0.3 (moderate). Only meaningful when `commandEconomyEnabled`.
   */
  commandEconomySecondEconomyTolerance?: number;
  /**
   * Player line-of-credit (central bank loans, multi-currency when forex is on).
   * Defaults to **enabled** — absent/undefined means on; only explicit `false` disables.
   */
  lineOfCreditEnabled?: boolean;
  /**
   * One-time rollout marker for the central-bank pricing change. The turn
   * engine fills in startedTurn when a fresh world reaches its first economy
   * turn; existing hosted worlds receive it from the startup migration.
   */
  centralBankPricingPhaseIn?: {
    startedTurn?: number;
    notificationSentTurn?: number;
  };
  /**
   * Private banking (1.1): corp-chartered banks, deposits, lending, failure.
   * Defaults to **disabled** — only explicit `true` enables. Flag-off is a
   * read-only freeze: pages render, no actions accepted, nothing unwinds.
   */
  privateBankingEnabled?: boolean;
  bankConstructionAdmissions?: import("@/lib/banking/constructionAdmission").ConstructionAdmission[];
  bankConstructionAdmissionClosing?: boolean;
  bankConstructionAdmissionClosingToken?: string;
  /** Experimental funded spendable government-cash ledger. Absent means off. */
  treasuryCashLedgerEnabled?: boolean;
  /** Kill switch: investment-bank proprietary trading (incl. leveraged forex). Default on when banking is on. */
  bankPropTradingEnabled?: boolean;
  /** Kill switch: bank-failure contagion cascade. Default on when banking is on. */
  bankContagionEnabled?: boolean;
  /** Funded plant construction loans. Off unless explicitly enabled. */
  bankConstructionFinanceEnabled?: boolean;
  /**
   * Savings account rollout. `off`: legacy character fields only. `shadow`:
   * accounts are materialized from the legacy fields every turn and compared,
   * nothing reads them. `authoritative`: commands write the accounts and the
   * legacy fields are projections; reads follow `savingsAccountsReadCurrencies`.
   * Absent means off.
   */
  savingsAccountsMode?: "off" | "shadow" | "authoritative";
  /**
   * Currencies whose balance-sheet and API reads come from the accounts (real
   * player-deposit liabilities) rather than the legacy pointer model. Rolled
   * out one cohort at a time; absent means none.
   */
  savingsAccountsReadCurrencies?: string[];
  /** Per-currency M1/M2 snapshots, monetary transmission, and central-bank operations. */
  moneySupplyEnabled?: boolean;
  /**
   * Index funds rollout mode: off (disabled), partial (view + cron), full (+ trades).
   * Legacy `indexFundsEnabled: true` is treated as full when mode is absent.
   */
  indexFundsMode?: "off" | "partial" | "full";
  /**
   * @deprecated Use `indexFundsMode`. When true and mode is absent, treated as full.
   */
  indexFundsEnabled?: boolean;
  /**
   * Labour/Unions economic system rollout mode. Graduated, each tier a superset
   * of the previous (see docs/plans/2026-06-30-labour-system.md):
   *   off    — today's economy, unchanged (default)
   *   wages  — explicit labor cost, wage slider, min-wage law, automation tech
   *   macro  — wages ↔ unemployment ↔ politics loop (the MVP goal)
   *   unions — NPC unionization metric, strikes, union-busting, union laws
   *   full   — player-run unions (capstone)
   * Absent/unknown is treated as "off". Resolve via `getLabourSystemMode`.
   */
  labourSystemMode?: "off" | "wages" | "macro" | "unions" | "full";
  /** Username of the admin who last changed the labour system mode. */
  labourSystemModeUpdatedBy?: string;
  /** When the labour system mode was last changed (ISO 8601). */
  labourSystemModeUpdatedAt?: string;
  /**
   * Structural market rework rollout mode (audit t806, "Nothing Wants to
   * Sell"). Graduated, each tier a superset of the previous (see
   * docs/plans/2026-07-03-market-structural-plan.md):
   *   off         — today's economy, unchanged (default)
   *   realization — Fix 1: realized revenue scaled by lagged market price
   *   ledger      — Fix 3: commodity flow ledger + inventory (D0/D1)
   *   clearing    — Fix 2: posted prices + cheapest-first market clearing
   *   capital     — Fix 4: capital/unit-cost model, revenue retires as primitive
   *   plants      — P2: owned capacity is authoritative, revenue is derived
   * Absent/unknown is treated as "off". Resolve via `getMarketSystemMode`.
   */
  marketSystemMode?: import("@/lib/market/modes").MarketSystemMode;
  /** Username of the admin who last changed the market system mode. */
  marketSystemModeUpdatedBy?: string;
  /** When the market system mode was last changed (ISO 8601). */
  marketSystemModeUpdatedAt?: string;
  /**
   * The world turn the market system mode was last changed ON.
   *
   * A wall-clock timestamp is not enough for a tier flip. Every post-flip
   * question an operator asks is turn-indexed — "how many turns of soak do we
   * have", "which turns are pre-flip baseline", "is the plants governor ramp
   * done" — and the answer has to survive the fact that turns do not advance on
   * a fixed wall-clock cadence (pauses, stalls, sim worlds). `plantsStartTurn`
   * is stamped per sector lazily on its first plants turn, so it cannot answer
   * "when did the WORLD flip" for a sector that has not migrated yet. This is
   * that answer, recorded once at the moment of the flip.
   */
  marketSystemModeUpdatedTurn?: number;
  /**
   * Turn the plants launch governor starts gliding out. Unset = no glide; each
   * sector fades the governor over its own ramp from its first plants turn.
   * Once set, every sector's ramp share is at least
   * `(turn - start) / marketGovernorGlideTurns`, so the governor is gone for
   * everyone after the glide. See `governorGlideAnchorTurn`.
   */
  marketGovernorGlideStartTurn?: number;
  /** Length of the governor glide in turns (default 24). */
  marketGovernorGlideTurns?: number;
  /**
   * "proportional": every governed sector closes the same fraction of its
   * remaining gap to the market each turn of the glide, instead of only being
   * lifted once the floor `(turn - start) / glideTurns` passes its own share.
   * Unset = the floor glide. See `proportionalGlideAnchorTurn`.
   */
  marketGovernorGlideMode?: "floor" | "proportional";
  /**
   * Proportional glide only: the floor glide's share (0-1) frozen on the
   * switch-over turn, so sectors the floor glide had already lifted start the
   * proportional glide from there instead of falling back.
   */
  marketGovernorGlideFloor?: number;
  /**
   * Turn the no-buyer extraction phase-out started. A mine whose recipe has no
   * leg its state can extract offers nothing to the market, yet the deposit
   * ramps (the 0.5 haircut floor below plants, the launch-governor ramp under
   * plants) kept paying it for part of its output. From this turn those ramps
   * close over EXTRACTION_NO_BUYER_PHASE_OUT_TURNS (24) for such mines only.
   * Stamped by the corporation turn the first time it runs without one, so the
   * phase-out starts when the code deploys. Cleared on world reset.
   */
  extractionNoBuyerPhaseOutStartTurn?: number;
  /**
   * Turn the revenue-follows-placement phase-in starts, set by an operator
   * (never stamped automatically). See src/lib/market/placementRevenuePhase.ts.
   */
  placementRevenuePhaseStartTurn?: number;
  /**
   * Operator-scheduled country recessions: capacity contraction spread over a
   * window of turns. See src/lib/market/countryRecession.ts. Cleared on reset.
   */
  countryRecessions?: import("@/lib/market/countryRecession").CountryRecession[];
  /**
   * Turn a live world starts moving macro demand onto anchor state GDP over
   * STATE_GDP_ANCHOR_PHASE_TURNS (operator-set; worlds seeded with
   * GameState.stateGdpAnchoredDemand are already fully on). See sectorLedger.ts.
   */
  stateGdpAnchorPhaseStartTurn?: number;
  /**
   * Turn the input-demand-follows-real-output phase-in starts, set by an
   * operator (never stamped automatically). See src/lib/market/inputDemandRealPhase.ts.
   */
  /**
   * Turn trade convergence starts ramping from 0.5 to 1 (see
   * tradeConvergenceK). Stamped by an operator, announced ahead. Absent = 0.5.
   */
  tradeConvergenceFullStartTurn?: number;
  inputDemandRealPhaseStartTurn?: number;
  /**
   * Geographic freight rollout. Shadow records routes for calibration; active
   * also feeds delivered state inputs into next turn's plant throughput.
   */
  freightSettlementMode?: "shadow" | "active";
  /** Username of the admin who last changed the freight-settlement rollout. */
  freightSettlementModeUpdatedBy?: string;
  /** When the freight-settlement rollout was last changed (ISO 8601). */
  freightSettlementModeUpdatedAt?: string;
  /** World turn at which the freight-settlement rollout was last changed. */
  freightSettlementModeUpdatedTurn?: number;
  /** Governance record required for active freight settlement. */
  freightSettlementIntervention?: EconomicInterventionPlan;
  /**
   * Gradual freight-settlement ramp (markets plan Phase 4). When set, the
   * ACTIVE effect fades in linearly instead of landing at full strength on the
   * flip turn: a ramp fraction R = clamp01((turn - rampStartTurn) / rampTurns)
   * scales both the delivered-supply cap (the state price leg blends from full
   * supply toward the freight-limited delivered supply by R) and the canonical
   * freight billing legs (charge/credit are multiplied by R). This turns a hard
   * balance step into a measured phase-in so sales caps and the shipping bill
   * arrive together, gradually, with the effect visible each turn on the
   * markets tracker and the sector Freight tag. Unset (or rampTurns <= 0) → R is
   * 1 whenever active, i.e. the pre-ramp instant-activation behavior, byte
   * identical. Applies to whichever of freightSettlementMode:"active" /
   * canonicalFreightBillingEnabled is on.
   */
  freightSettlementRampStartTurn?: number;
  freightSettlementRampTurns?: number;
  /**
   * Timed economy-only pause, for the stretch right after an economy reset.
   * Economy phases are skipped on every turn number strictly below it (see
   * `getEconomyPausePredicate` in src/lib/turn/economyPause.ts): politics,
   * elections, campaigns, parties and legislation keep running while prices,
   * corporations, banking and the ledger hold. The window ends by itself, since
   * the turn numbered `economyPauseUntilTurn` runs the economy normally. Absent
   * or null means no pause.
   */
  economyPauseUntilTurn?: number | null;
  /**
   * SIM-ONLY turn-phase profile (headless worldsim; never set in prod).
   * "elections-only" makes processTurn() skip the economy/finance/ledger
   * phases (see ELECTIONS_SKIP_PHASES in src/simulation/phases/simTurnProfiles.ts)
   * and run only the political/election/approval/campaign phases against a
   * seeded sandbox world — so an election-balance run isn't paying for
   * corporationTurn/markets/forex. Absent/unknown → "full" (prod default,
   * byte-for-byte unchanged). Written onto the sandbox gameConfig by
   * scripts/sim/runWorld.ts, mirroring how marketSystemMode is applied.
   */
  simTurnPhaseMode?: "full" | "elections-only" | "economy-only" | "macro-only";
  /**
   * SIM-ONLY marker: this database is a headless sandbox world, not a live
   * deployment. Written onto the sandbox gameConfig by scripts/sim/runWorld.ts
   * on every run; never set in production, where it stays undefined.
   *
   * Its one job today is to disable the cron-drift auto-pause guard in
   * turnSystem.ts. That guard infers "the hourly cron has stopped" from the
   * wall-clock gap since the last completed turn — a sound inference for a live
   * deployment and a meaningless one for a sandbox, whose turns are driven on
   * demand by runWorld.ts and whose gap is just "how long since someone last
   * ran this seed". Without this flag, resuming any existing sandbox world
   * fails on its first turn.
   */
  simSandbox?: boolean;
  /**
   * Launch-safety governor for the clearing/throughput revenue legs. `cap` is
   * the max fractional deviation (0–1) those legs may take from the ledger
   * baseline; `rampTurns` is the fade-in window from the flip. Tunable live so
   * the flip can be tightened/loosened on prod without a deploy. Unset → the
   * code defaults (0.15 / 240). See MARKET_REALIZATION_DEVIATION_CAP.
   */
  marketGovernorCap?: number;
  marketGovernorRampTurns?: number;
  /**
   * Scarcity price drift (week-1 clearing balance pass): when true, commodity
   * prices gain memory — persistent unmet demand ratchets a per-commodity
   * multiplier up a clamped step each turn (persistent surplus, down), so
   * chronic shortages finally translate into a rising price signal. Off (or
   * unset) → memoryless baseline, multipliers reset to 1.
   */
  commodityScarcityDriftEnabled?: boolean;
  /**
   * Commodity treadmill fix stage, 0..6, advanced one per turn by an operator.
   * See src/lib/market/commodityFixStages.ts for what each stage changes.
   * Unset or 0 keeps every pre-fix constant.
   */
  commodityFixStage?: number;
  /**
   * Market recovery program stage (kanban 254504), advanced one per turn by an
   * operator after a one-turn health check; lowering it rolls a stage back.
   * See src/lib/market/marketRecoveryStages.ts. Unset or 0 changes nothing.
   */
  marketRecoveryStage?: number;
  /**
   * Run the unified producer market in memory each turn beside the live engine
   * and record a per-industry comparison in `producerMarketShadows`. Telemetry
   * only: moves no money and writes no sector or corporation.
   */
  producerMarketShadowEnabled?: boolean;
  /**
   * First turn the funded producer market settles live (funded-market cutover).
   * Unset keeps the legacy engine. Requires the opening conversion marker on the
   * previous turn; once a funded turn has run, the world cannot return to
   * legacy. See src/lib/market/producerMarket/liveMode.ts.
   */
  producerMarketLiveFromTurn?: number;
  /**
   * Turn the one-time entertainment commodity removal migration ran
   * (migrateEntertainmentRemoval). Present means later turns skip it.
   */
  entertainmentCommodityRemovedAtTurn?: number;
  /**
   * Money wiring (interstate-logistics plan step 5, phase A): when true, a
   * sector's input bill adds the landed-price premium for out-of-state
   * sourcing (last turn's sourcingNetworkLoad doc) on top of the global lagged
   * price ratio, so plants in states that source interstate/import actually
   * pay for it. Off (or unset) → inputsCost is unchanged, matching the
   * record-only sourcing pass behavior from before this flag existed.
   */
  interstateMoneyWiringEnabled?: boolean;
  /**
   * Canonical freight billing v1 (issue #897, markets plan Phase 4): when
   * true, the sourcing pass's per-state shipping money (charge = freight price
   * x price TEU weight x units x hops on each accepted domestic haul) is
   * persisted on the sourcingNetworkLoad doc and the next corporation turn
   * apportions it: charges across buyer sectors in the destination state
   * proportional to their input demand for the hauled commodity, haul revenue
   * across freight-supplying sectors in the origin state proportional to
   * their freight supply share. Both legs are persisted per sector as named
   * lines (freightBillingCharge / freightBillingCredit) and ride sector costs
   * and revenue. A transfer, not a sink: world totals of the two legs match.
   * Off (or unset) → nothing is computed or written, matching the shadow-price
   * behavior from before this flag existed. ENABLING IS A BALANCE CHANGE
   * (~22M world-scale bill at audit calibration; the sourcing aggregates are
   * DAILY money, spread over TURNS_PER_DAY when charged, ticket 1448) and
   * merges only with a simulation report from scripts/sim/ per CONTRIBUTING.md.
   */
  canonicalFreightBillingEnabled?: boolean;
  /**
   * When true, states below 50 percent local fill accept a progressively wider
   * landed-price range, capped at 75 percent above the local price anchor.
   * Default false until controlled simulation and rollout gates pass.
   */
  shortageResponsiveSourcingEnabled?: boolean;
  /** Governance record required when shortage-responsive sourcing is enabled. */
  shortageResponsiveSourcingIntervention?: EconomicInterventionPlan;
  /**
   * Dark gate for sovereign tranche consolidation (#1001): folds below-floor
   * quarterly issuance rungs into the largest rung so small deficit quarters
   * stop minting sliver issues nobody holds. Default off until worldsim
   * evidence lands; ENABLING IS A BALANCE CHANGE and merges only with a
   * simulation report from scripts/sim/ per CONTRIBUTING.md.
   */
  sovereignIssuanceConsolidationEnabled?: boolean;
  /** Dark gate for the index-fund 20 percent sovereign-bond allocation target. */
  indexFundBondLiquidityEnabled?: boolean;
  /**
   * Dark gate for domestic sovereign-bond coverage (#1001): ensures one
   * home-sovereign bond fund per uncovered sovereign issuer so the existing
   * real-cash deploy pass can reach their paper. Default off until worldsim
   * evidence lands; ENABLING IS A BALANCE CHANGE and merges only with a
   * simulation report from scripts/sim/ per CONTRIBUTING.md.
   */
  domesticSovereignBondCoverageEnabled?: boolean;
  /** Governance record required when the sovereign-bond allocation target is enabled. */
  indexFundBondLiquidityIntervention?: EconomicInterventionPlan;
  /**
   * Dark gate for autonomous NPP index-fund redemption (#2120). When true,
   * autonomous NPP investing may redeem fund units (enqueueing a redemption
   * and, on the cron pass, selling holdings for cash), so the subscribe ->
   * rebalance -> redeem round trip is exercised by a non-player actor instead
   * of only by the player redeem route. Default off: enabling it changes
   * simulated NPP portfolios and fund liquidity, so it merges only with a
   * worldsim report from scripts/sim/ per CONTRIBUTING.md.
   */
  nppFundRedemptionEnabled?: boolean;
  /** Dark gate for bounded, index-fund-backed two-sided equity quotes. */
  equityLiquidityFacilityEnabled?: boolean;
  /** Governance record required when the equity-liquidity facility is enabled. */
  equityLiquidityFacilityIntervention?: EconomicInterventionPlan;
  /** Route each existing NPP entry slot to a facility-ready empty market first. */
  nppMarketCoverageEnabled?: boolean;
  /** Governance record required when empty-market coverage routing is enabled. */
  nppMarketCoverageIntervention?: EconomicInterventionPlan;
  /** Route existing eligible NPP entry slots toward four diagnosed fragile commodity markets. */
  nppFragileMarketSupplyEnabled?: boolean;
  /** Governance record required when fragile-market supply routing is enabled. */
  nppFragileMarketSupplyIntervention?: EconomicInterventionPlan;
  /**
   * Legacy-stockpile cover cap (week-1 clearing balance pass): when true,
   * shadow-inventory stock above STOCK_COVER_CAP_TURNS × current demand takes
   * an additional EXCESS_STOCK_SPOILAGE_RATE per-turn spoilage on the excess
   * only, phasing out the 2.4B-unit pre-clearing overhang instead of letting
   * it flood posted-price markets. Write-down is recorded on the flow ledger
   * (`excessSpoiledUnits`). Off (or unset) → base spoilage only, unchanged.
   */
  stockCoverCapEnabled?: boolean;
  /**
   * Brand loyalty (Package A). When true, corps accrue/decay a 0–100 loyalty
   * each turn from pricing consistency + delivery, and a relative loyal-slice
   * pre-pass runs before cheapest-first clearing. Ships dark: shadow-accrue a
   * fiscal year (state written, slice NOT applied) to verify the distribution
   * spreads, then enable the slice. Off (or unset) → no loyalty, clearing
   * unchanged. See src/lib/market/brandLoyalty.ts and /reports/brand-loyalty-plan.
   */
  brandLoyaltyEnabled?: boolean;
  /**
   * Second-stage gate: when true (and brandLoyaltyEnabled), the loyal-slice
   * pre-pass actually reserves demand in clearing. When false, loyalty still
   * accrues (shadow) but does not yet change any fills — the A1→A2 gate.
   */
  brandLoyaltySliceEnabled?: boolean;
  /**
   * Output quality (four production pillars: tech, inputs, wages, operations).
   * When true, each non-extraction sector's output quality is computed each
   * turn, rolled up to corp `averageQuality` and to per-commodity quality
   * (which feeds next turn's input pillar — quality propagates up the chain).
   * Display/telemetry in Package A; a hook for premium demand in Package B.
   * Off (or unset) → no quality computed. See src/lib/market/brandQuality.ts.
   */
  sectorQualityEnabled?: boolean;
  /**
   * Package B — quality → premium pricing coupling. When true (and
   * sectorQualityEnabled), a selling sector's owning corp `averageQuality`
   * modulates the PREMIUM portion of its pricing posture in market clearing:
   * a corp that posts a premium (positive posture) realizes a larger premium
   * when its quality is above neutral and a smaller one when below. Undercutters
   * (non-positive posture) are unaffected — quality never lets you charge less.
   * Off (or unset) → clearing is byte-identical and quality stays display-only.
   * See src/lib/market/clearing.ts (qualityPremiumMultiplier).
   */
  qualityPremiumPricingEnabled?: boolean;
  /** Funded political advertising orders, settled against unsold media output. */
  politicalMediaMarketEnabled?: boolean;
  /** Fresh-world explicit plant overhead. Default off preserves legacy residuals. */
  explicitPlantCostsEnabled?: boolean;
  /**
   * Private supply agreements. When true, active bilateral supply contracts are
   * fulfilled in a contracted pre-pass before the loyal-slice and cheapest-first
   * clearing passes (supplier output guaranteed to the buyer, off the open
   * market). Off (or unset) → agreements are inert. See
   * src/lib/db/types/supplyAgreement.ts.
   */
  supplyAgreementsEnabled?: boolean;
  /** Qualified subsidiary group routing. NPP directions use the separate world subsidiaries gate. Default off for existing worlds. */
  groupSupplyCoordinationEnabled?: boolean;
  /**
   * Demographics as a 4th demand source (besides retail, corps, government).
   * When true, income demographics add consumer demand for final-consumer
   * commodities each turn, scaled by state GDP. DEFAULT OFF and UNCALIBRATED —
   * this adds demand on top of a market already running shortages, so it needs
   * sizing against measured demand before enabling (see the output-rate caveat
   * in /reports/brand-loyalty-plan). See DEMOGRAPHIC_DEMAND_GDP_FRACTION.
   */
  demographicsDemandEnabled?: boolean;
  /**
   * Household Ledger — income-driven final consumer demand (see
   * `src/lib/turn/householdConsumption.ts`). When true, a per-state consumption
   * budget derived from GDP and modulated by household signals (medianIncome,
   * unemploymentRate, consumerConfidence) buys a consumer basket with a bounded
   * price-elasticity response, and SUPERSEDES retail's SECTOR_DEMAND input proxy
   * (those legs are suppressed in `computeRawSupplyDemand`). Retail's legacy
   * supply-derived output demand is removed through the bounded transition
   * below. DEFAULT OFF and UNCALIBRATED. Supersedes
   * `demographicsDemandEnabled` (do not enable both).
   */
  householdConsumptionEnabled?: boolean;
  /**
   * Optional per-world override for HOUSEHOLD_CONSUMPTION_PER_CAPITA (millions ₳
   * per person per turn). Lets a sandbox tune consumer-demand sizing without a
   * redeploy. Absent/≤0 falls back to the code default. Only read when
   * `householdConsumptionEnabled` is true.
   */
  householdConsumptionPerCapita?: number;
  /**
   * Turn when this world began removing Retail's legacy supply-derived demand.
   * Absent preserves legacy behavior. Once started, the remaining self-loop
   * share declines linearly and stays at zero after the configured duration.
   */
  retailDemandTransitionStartTurn?: number;
  /** Duration of the Retail demand unwind. Defaults to 192 turns. */
  retailDemandTransitionTurns?: number;
  /**
   * Whether NPP-run corporations are individually attackable in the state
   * economy view. DEFAULT ON (only an explicit `false` disables). When on, NPP
   * corps render as individual navigable/attackable rows instead of being
   * collapsed into a single non-attackable aggregate slice (fixes "no way to
   * attack NPP corps"). The attack route already permits it — this is the
   * discovery/UI gate.
   */
  nppCorpsAttackable?: boolean;
  /**
   * Launch guard (automated kill switch, opt-in). When `marketGuardEnabled` and
   * the mode is clearing/capital, the turn stamps a reference market cap and
   * auto-reverts to `ledger` if aggregate mcap falls more than `marketGuardDropPct`
   * (default 0.25) below it, after `marketGuardGraceTurns` (default 5). See
   * src/lib/market/launchGuard.ts.
   */
  marketGuardEnabled?: boolean;
  marketGuardReferenceMcap?: number;
  /** Aggregate fundamental valuation stamped alongside the reference mcap. The
   *  guard measures drawdown against what fundamentals justify, so a prime-rate
   *  repricing does not read as a market break. */
  marketGuardReferenceFundamentalMcap?: number;
  marketGuardReferenceTurn?: number;
  marketGuardDropPct?: number;
  marketGuardGraceTurns?: number;
  marketGuardTrippedAt?: string;
  /**
   * Structural extraction-shortage stabilizer (audit t873). When true, the
   * per-resource EXTRACTION_OUTPUT_SCALE multipliers lift extraction supply to
   * neutralize the chronic extractable shortage. Absent/false is inert.
   * Calibration stabilizer, not the durable fix — see EXTRACTION_OUTPUT_SCALE.
   */
  extractionOutputScaleEnabled?: boolean;
  /**
   * Shadow double-entry ledger master flag (audit: t841 FX blowup / ghost-bank
   * / phantom-credit bug class). When on, financialTxLog emissions are ALSO
   * mirrored into the shadow `ledgerEntries` collection and a per-turn
   * reconciler (src/lib/ledger/reconcile.ts) asserts a conservation law and
   * alarms on violations. SHADOW-ONLY (Phases 1-3): game behavior is unchanged;
   * game code never reads the ledger. Off by default in prod seeds; on in the
   * sim harness. Absent/false = off. See
   * docs/plans/2026-07-05-shadow-ledger-plan.md.
   */
  ledgerShadow?: boolean;
  /**
   * Temporary anonymous read-only mode: when true, content pages that normally
   * redirect unauthenticated visitors to /login render in read-only mode
   * instead. Personal surfaces (/profile, /portfolio, /actions, /mail,
   * /settings) and all admin/moderator routes remain gated.
   */
  publicReviewMode?: boolean;
  /**
   * When true, the state overview tab shows active approval modifiers
   * (Economic Boom, Population Decline, etc.) in a dedicated card.
   * Defaults to off until enabled from the admin dashboard.
   */
  regionalConditionsOverviewEnabled?: boolean;
  /** Username of the admin who last toggled regional conditions overview. */
  regionalConditionsOverviewEnabledBy?: string;
  /** When regional conditions overview was last toggled (ISO 8601). */
  regionalConditionsOverviewEnabledAt?: string;

  /**
   * Master "public viewing mode" switch for unauthenticated **API reads**.
   *
   * Defaults to **enabled** — absent/undefined means on; only an explicit
   * `false` engages the gate. While enabled, anonymous GET/HEAD requests to
   * internal API routes are served as before (the site stays fully public).
   * When an admin sets it to `false`, the proxy middleware requires a valid
   * session for internal read routes, which blocks unauthenticated scrapers
   * hammering the page-serving JSON endpoints at bot scale. Self-protected and
   * pre-login namespaces (public API, auth, assets, webhooks — see
   * `@/lib/publicViewing`) stay reachable regardless. Can also be forced via
   * the `PUBLIC_VIEWING_MODE` env var (`"true"`/`"false"`).
   */
  publicViewingMode?: boolean;
  /** Username of the admin who last toggled public viewing mode. */
  publicViewingModeUpdatedBy?: string;
  /** When public viewing mode was last toggled (ISO 8601). */
  publicViewingModeUpdatedAt?: string;
  /**
   * When true (default), joining a default party with no chair and no active
   * chair election assigns the joiner as national chair. When false, chair
   * stays vacant until set elsewhere. Chartered parties are never
   * auto-chaired — their leadership is decided by elections.
   */
  firstJoinerBecomesPartyChair?: boolean;

  /** Test mode — when enabled, registration requires the TEST_SECRET to proceed. */
  testMode?: boolean;
  /**
   * Seed year that drives the landing page era theme and login page visuals.
   * Set via admin panel. Defaults to 1979 when absent.
   */
  seedYear?: number;
  /** Username of the admin who enabled test mode. */
  testModeEnabledBy?: string;
  /** When test mode was last toggled on. */
  testModeEnabledAt?: string;

  /**
   * Admin registration master switch. Defaults to `true` on fresh seed so the
   * first admin can self-register with ADMIN_REGISTRATION_KEY. Flip to `false`
   * from the admin dashboard once enough admins exist. Treated as enabled when
   * undefined for legacy configs.
   */
  adminRegistrationEnabled?: boolean;
  /** Username of the admin who last disabled admin registration. */
  adminRegistrationDisabledBy?: string;
  /** When admin registration was last disabled. */
  adminRegistrationDisabledAt?: string;

  /**
   * Master kill-switch for all new-user registration (email/password +
   * Google OAuth + Discord OAuth new-user branch). Distinct from
   * `adminRegistrationEnabled`, which gates the admin-key side-channel.
   * undefined/true = open, false = closed.
   */
  registrationEnabled?: boolean;
  /** Username of the admin who last disabled player registration. */
  registrationDisabledBy?: string;
  /** When player registration was last disabled (ISO 8601). */
  registrationDisabledAt?: string;

  /**
   * Toggle for the registration-collision auto-block at registration.
   * When true, a new registration is blocked if it reuses an existing
   * account's `registrationIp`, browser tracking cookie, or exact
   * fingerprint. IP allowance rows only bypass the IP-based part.
   * Default (undefined/false): the collision check is disabled and only
   * manual IP bans apply.
   */
  ipCollisionCheckEnabled?: boolean;
  /** Ops gate for future character creation. Absent means off; existing characters stay playable. Preserved across world resets. */
  discordLinkRequiredForCharacter?: boolean;
  /** Username of the admin who last flipped the collision check. */
  ipCollisionCheckEnabledBy?: string;
  /** When the collision check was last enabled (ISO 8601). */
  ipCollisionCheckEnabledAt?: string;

  /** Fraction of partyInfluence lost per turn (default 0.04 = 4%/turn). */
  partyInfluenceDecayRate?: number;
  /** Max partyInfluence gain per turn at perfect policy alignment (default 3). */
  partyInfluenceBaseRate?: number;
  /** Maximum infamy penalty applied to partyInfluence gain per turn (default 4). */
  partyInfluenceMaxPenalty?: number;
  /** Multiplier applied to player count to determine per-party bonus action pool (default 3). */
  partyInfluencePoolMultiplier?: number;
  /** Maximum bonus actions per player per turn from party influence (default 6). */
  partyInfluenceMaxBonus?: number;

  /**
   * When set, referral completions after this time increment `users.referralContestCount`
   * for admin contest leaderboards. Cleared when a contest is ended or reset from the admin panel.
   */
  referralContestStartedAt?: Date;

  /**
   * Master toggle for IP/VPN detection via ipapi.co.
   * When enabled, new registrations check the IP against ipapi.co and store
   * geo + VPN/proxy/Tor data on the user doc. Login backfill also activates.
   * Default (undefined/false): disabled.
   */
  ipDetectionEnabled?: boolean;
  /** Username of the admin who last toggled IP detection. */
  ipDetectionEnabledBy?: string;
  /** When IP detection was last toggled (ISO 8601). */
  ipDetectionEnabledAt?: string;

  /**
   * Resource prospecting system (geological surveys that expand a state's
   * per-resource extraction capacity). DEFAULT OFF — absent/false is inert and
   * the prospectingResolution turn phase no-ops. Resolve via isProspectingEnabled.
   * See src/lib/extraction/featureFlag.ts.
   */
  prospectingEnabled?: boolean;
  /** Username of the admin who last toggled prospecting. */
  prospectingEnabledUpdatedBy?: string;
  /** When prospecting was last toggled (ISO 8601). */
  prospectingEnabledUpdatedAt?: string;

  /**
   * Player-facing extraction-contract issuance (offer→accept, signing fee,
   * per-turn royalty settlement, term/offer expiry). DEFAULT OFF — absent/false
   * is inert and the contractSettlement turn phase no-ops; existing admin-
   * granted contracts keep working. Resolve via isContractIssuanceEnabled.
   */
  contractIssuanceEnabled?: boolean;
  /** Username of the admin who last toggled contract issuance. */
  contractIssuanceEnabledUpdatedBy?: string;
  /** When contract issuance was last toggled (ISO 8601). */
  contractIssuanceEnabledUpdatedAt?: string;

  /**
   * Unified action audit spine master flag (forensics/alt-detection rework
   * plan §3.1). When on, `recordAudit`/`recordAuditBulk` writes normalized
   * envelopes into `actionAuditLog` from the money/staff/auth/turn choke
   * points. DEFAULT OFF — absent/false is inert (fail-closed, matches
   * `isLedgerShadowEnabled`). Resolve via `isAuditLogEnabled`.
   */
  auditLog?: boolean;
  /** Username of the admin who last toggled the audit log. */
  auditLogUpdatedBy?: string;
  /** When the audit log flag was last toggled (ISO 8601). */
  auditLogUpdatedAt?: string;

  /**
   * Alt-detection weighted-evidence confidence scoring master flag
   * (forensics/alt-detection rework plan §3.2). When on, the `altScoring`
   * turn phase / compute path upserts `altLinks`/`altClusters` from the
   * signal registry. DEFAULT OFF — absent/false is inert (fail-closed).
   * Resolve via `isAltScoringEnabled`.
   */
  altScoringEnabled?: boolean;
  /** Username of the admin who last toggled alt scoring. */
  altScoringEnabledUpdatedBy?: string;
  /** When the alt scoring flag was last toggled (ISO 8601). */
  altScoringEnabledUpdatedAt?: string;

  /**
   * Admin-editable overrides for the alt-detection signal weights and
   * link/cluster thresholds (forensics/alt-detection rework plan §3.2/§4.9
   * `GET/PUT /api/admin/alts/config`). Partial and possibly malformed —
   * always resolve through `resolveAltScoringConfig`
   * (`src/lib/altDetection/config.ts`), which merges this onto the
   * fail-closed defaults and drops any out-of-range value rather than
   * applying it. Absent entirely is valid (defaults apply).
   */
  altScoring?: {
    weights?: Partial<Record<string, number>>;
    thresholds?: Partial<Record<string, number>>;
  };
  /** Username of the admin who last edited the alt-scoring weights/thresholds. */
  altScoringUpdatedBy?: string;
  /** When the alt-scoring weights/thresholds were last edited (ISO 8601). */
  altScoringUpdatedAt?: string;

  /**
   * Era price-level deflator for campaign finance (#2119). When true, campaign
   * action fund costs and campaign income are scaled by the active era's price
   * level relative to the modern baseline, so a 1953 world stops charging
   * 2019-scale dollar costs while paying 2019-scale income. The per-region GDP
   * ratio from #798 already varies WITHIN an era; this adds the BETWEEN-era
   * price level on top. Default off (absent means off, byte-identical to
   * today): enabling it is a balance change and merges only with a simulation
   * report from scripts/sim/ per CONTRIBUTING.md.
   */
  campaignEraPriceLevelEnabled?: boolean;
}

/**
 * Subset of {@link GameConfig} safe to expose to unauthenticated clients.
 * Server-only secrets (Discord webhook URLs) must never cross this boundary.
 */
export type PublicGameConfig = Omit<
  GameConfig,
  | "discordGameWebhookUrl"
  | "discordCountryGameWebhookUrls"
  | "discordNewsWebhookUrl"
  | "discordChangelogWebhookUrl"
  | "discordSuggestionsWebhookUrl"
  | "discordWebhookOwnerService"
>;
