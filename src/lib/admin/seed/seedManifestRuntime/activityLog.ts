import type { CollectionEntry } from "@/lib/admin/seed/seedManifestTypes";

export const RUNTIME_ACTIVITYLOG: CollectionEntry[] = [
  {
    name: "activityLog",
    category: "runtime",
    notes:
      "Mixed collection. World rows (turn_summary, game_action, fund_event, party_change) are read by turn number and recent-activity windows, so they are wiped on reset. Login/logout rows (IP, user agent, fingerprint, tracking id) and character_deleted markers are account history that alt detection and the moderation dossier read; reset keeps them. Partial delete in resetGameWorld (PRESERVED_ACTIVITY_LOG_TYPES); the 30-day TTL still bounds everything.",
  },

  { name: "turnLogs", category: "runtime" },

  { name: "checkpointRuns", category: "runtime" },

  {
    name: "singleplayerRuntime",
    category: "runtime",
    notes: "Local pause state resets with the world.",
  },

  // ── 2026-06 manifest-completeness backfill ─────────────────────────────────
  // Collections that existed in code but were never classified, so they
  // silently survived resets. Grouped by subsystem. Added alongside the move to
  // a manifest-driven reset wipe (resetGameWorld now wipes every runtime entry).

  // Governor's / Presidential Office (derived executive state; reset re-seeds
  // office-state rows via seedOfficeStates).
  { name: "governorOfficeState", category: "runtime" },

  { name: "governorAddresses", category: "runtime" },

  { name: "governorExecutiveOrders", category: "runtime" },

  { name: "governorEndorsements", category: "runtime" },

  { name: "governorLegislationQueue", category: "runtime" },

  { name: "executiveEndorsements", category: "runtime" },

  { name: "partyGroupFavorability", category: "runtime" },

  // Party runtime (charters, agendas, strength ledgers, treasury approvals).
  {
    name: "partyCharters",
    category: "runtime",
    notes:
      "Player-party charters. resetGameWorld handles cleanup specially (preset-aware: drop-all vs. keep-default) rather than via the blanket sweep.",
  },

  { name: "partyAgendas", category: "runtime" },

  { name: "partyPoliticalStrengthLedger", category: "runtime" },

  { name: "partyStrengthPressure", category: "runtime" },

  { name: "pendingTreasuryTransactions", category: "runtime" },

  { name: "treasuryOperations", category: "runtime" },

  {
    name: "partyMembers",
    category: "runtime",
    notes:
      "Party membership state (read by gameHealthSnapshot). No in-repo writer found — may be bot-populated; must not carry across worlds, so wiped on reset.",
  },

  { name: "orgRegLedger", category: "runtime" },

  // Legislature leadership elections (US House/Senate + DE/CN chairs).
  { name: "houseLeadershipElections", category: "runtime" },

  { name: "senateLeadershipElections", category: "runtime" },

  { name: "bundestagspraesidentElections", category: "runtime" },

  { name: "bundestagspraesidentNominations", category: "runtime" },

  { name: "cppccChairElections", category: "runtime" },

  { name: "cppccChairNominations", category: "runtime" },

  { name: "npcscChairElections", category: "runtime" },

  { name: "npcscChairNominations", category: "runtime" },

  {
    name: "governmentFormationVotes",
    category: "runtime",
    notes:
      "Companion of governmentFormations; appears dormant (only referenced by name propagation).",
  },

  {
    name: "unifiedCabinetMembers",
    category: "runtime",
    notes: "Sibling of cabinetMembers; appears dormant (only referenced by name propagation).",
  },

  {
    name: "committeeAssignments",
    category: "runtime",
    notes:
      "Gameplay committee assignments (carry characterId); previously only dropped by seedLegislationTypes.",
  },

  // Cabinet-governed asset rosters. Bootstrap re-seeds these via zero-count-
  // guarded seeders (seedMilitaryUnits/seedCabinetEstates/…), so they were
  // surviving resets and blocking the fresh-preset roster from seeding.
  { name: "militaryUnits", category: "runtime" },

  { name: "cabinetEstates", category: "runtime" },

  { name: "energyPlants", category: "runtime" },

  { name: "infraProjects", category: "runtime" },

  // ── Conflicts subsystem (WIRE W1–W6) ─────────────────────────────────────────
  // All per-world military state, siblings of militaryUnits (already runtime
  // above). Every one is built by gameplay in a specific world and must not
  // outlive it — a command roster or half-fought battle carried into a fresh
  // world is exactly the drift this manifest exists to prevent.
  {
    name: "nationalArsenal",
    category: "runtime",
    notes:
      "Per-country materiel stock and grade by unit domain. Delivered by defence contracts, drawn by recruitment and by the refit step. RUNTIME: no seeder writes it — every nation starts with an empty store and builds up, so an absent document and an empty one are the same thing.",
  },

  {
    name: "defenceContracts",
    category: "runtime",
    notes:
      "Procurement contracts between a country's defence seat and one of its own defence sectors. RUNTIME: awarded by players, paid per delivered lot out of the defence appropriation. Wiped with the militaryUnits and corporateSectors they sit between.",
  },

  {
    name: "defenceProcurementAllocations",
    category: "runtime",
    notes:
      "Race-safe per-window contracting quotas. RUNTIME: derived from player-awarded defence contracts and must not survive a world reset.",
  },

  {
    name: "militaryCommands",
    category: "runtime",
    notes:
      "Per-country theater command org (regions, roster, assigned units), built by the defense holder. Wiped with the militaryUnits it references.",
  },

  {
    name: "militaryFormations",
    category: "runtime",
    notes:
      "Per-country combat org: unit formations + their general, and per-unit role assignments. Wiped with the militaryUnits it references.",
  },

  {
    name: "battleDeclarations",
    category: "runtime",
    notes:
      "Declared offensives awaiting resolution on the following turn. Purely in-flight turn state.",
  },

  {
    name: "battleReports",
    category: "runtime",
    notes: "Resolved/fizzled offensive records read by both nations' War Rooms. Per-world history.",
  },

  {
    name: "theaterState",
    category: "runtime",
    notes: "Per-country per-theater situation/CP pool. Regenerated by gameplay.",
  },

  {
    name: "navairEngagements",
    category: "runtime",
    notes:
      "Log of surface actions: which side held the water in a region on a turn, by what margin, and what was wrecked. Shown to players so the naval war is legible; nothing reads it back into the engine. Per-world history, wiped on reset.",
  },

  {
    name: "navairBasing",
    category: "runtime",
    notes:
      "Bilateral naval/air basing offers and accepted access. Wiped on world reset. Deterministic _id host:guest:domain is the concurrency and uniqueness key; the built-in _id index suffices for point writes. One bounded active-agreement scan per naval/air turn.",
  },

  {
    name: "navairChannels",
    category: "runtime",
    notes:
      "Per-country per-region air superiority, sea control and detection, advanced every turn by the navairOperations phase. Runtime: a region nobody has contested has no row at all, and an absent row reads as zero control, so a fresh world writes nothing here until a fleet or an air wing is stationed somewhere. Wiped with the militaryUnits it is derived from.",
  },

  {
    name: "nationalDoctrine",
    category: "runtime",
    notes:
      "Per-country doctrine tree selections. Chosen by the defense holder at runtime (era-gated), not seeded reference data.",
  },

  {
    name: "characterGenerals",
    category: "runtime",
    notes:
      "Per-character general profile (spec, level, xp, trained traits). Runtime rather than preserved: the level/xp is earned fighting this world's battles, and a soft reset retires every character while wiping militaryUnits/formations — so a surviving profile would be orphaned progression keyed to a retired character.",
  },

  // An indexFunds document mixes the seeded definition with world-bound cash,
  // units, holdings, baskets, and rebalance state. It must be rebuilt with its
  // position/transaction collections or old corporation ids survive a reset.
  {
    name: "indexFunds",
    category: "runtime",
    notes:
      "Dropped with the world and recreated by the forced idempotent fund bootstrap migrations; definitions and runtime accounting cannot safely survive independently.",
  },

  { name: "indexFundPositions", category: "runtime" },

  {
    name: "fundFloatSettlements",
    category: "runtime",
    notes:
      "Archived float settlement plans reference this world's funds and corporations; reset them with fund positions so prior-world recovery and undo records cannot survive.",
  },

  {
    name: "fundWritedownCompensationLedger",
    category: "runtime",
    notes:
      "Retired fund compensation receipts belong to the outgoing characters and wallets. Keep legacy databases covered by the reset sweep.",
  },

  { name: "indexFundRedemptionQueue", category: "runtime" },

  { name: "indexFundSnapshots", category: "runtime" },

  { name: "indexFundTransactions", category: "runtime" },

  {
    name: "indexFundCommands",
    category: "runtime",
    notes:
      "Player order receipts and audit outboxes belong to the same world as fund cash, positions and transactions. Never expire within an active world.",
  },

  {
    name: "frontierRaces",
    category: "runtime",
    notes:
      "Per-world frontier programme race funding, winners and licences. Rebuilt through gameplay and must not survive a world reset.",
  },

  {
    name: "pensionSchemes",
    category: "runtime",
    notes:
      "Per-world pension balances, holdings, liabilities, and sponsor state. Rebuilt through gameplay and must not survive a world reset.",
  },

  // Trade / diplomacy / international-org runtime.
  { name: "tradeEmbargoes", category: "runtime" },

  {
    name: "embargoCooldowns",
    category: "runtime",
    notes:
      "Trade-embargo cooldown ledger. Previously survived resets, leaking cooldowns into the new world.",
  },

  { name: "tradeFlowSnapshots", category: "runtime" },

  { name: "diplomaticActions", category: "runtime" },

  { name: "orgHeadAgendaActions", category: "runtime" },

  { name: "customInternationalOrganizations", category: "runtime" },

  { name: "organizationFunds", category: "runtime" },

  { name: "organizationLeadershipElections", category: "runtime" },

  { name: "organizationMembershipProposals", category: "runtime" },

  { name: "organizationPostures", category: "runtime" },

  // Seeded at reset from the authored alignment tables, then advanced by the
  // alignment turn phase — runtime world state, wiped and reseeded like the
  // org collections above.
  { name: "countryAlignments", category: "runtime" },

  {
    name: "sphereMemberships",
    category: "runtime",
    notes: "Seeded sphere membership and influence state for the current world iteration.",
  },

  // Queued influence plays, consumed by the alignment turn phase. Player
  // actions against runtime world state, so wiped and reseeded with it.
  { name: "alignmentPlays", category: "runtime" },

  // Flashpoints blocs bid over. Runtime world state like the rows they move.
  { name: "alignmentCrises", category: "runtime" },

  // The German Question and any later settlement crisis: a standing contest
  // over one nation's constitutional settlement, opened per iteration and
  // advanced by the settlement turn phase. Runtime world state — wiped and
  // reopened on reset, exactly like the alignment rows it sits beside.
  { name: "settlementCrises", category: "runtime" },

  // Queued and resolved plays against a settlement crisis. Player actions
  // against runtime world state, so wiped with it. Resolved rows are stamped
  // rather than deleted during a world's life (they are the audit trail for
  // what a player's money bought), but they do not outlive the world.
  { name: "settlementPlays", category: "runtime" },

  // Crises / referendums / debates / discussions.
  { name: "crisisAidCommitments", category: "runtime" },

  { name: "crisisInteractions", category: "runtime" },

  { name: "crisisLeverUses", category: "runtime" },

  {
    name: "crisisDetectorStreaks",
    category: "runtime",
    notes:
      "Consecutive turns each Crisis v2 detector condition has held. Turn-based, so it resets with the world.",
  },

  { name: "refugeeReceptionHistory", category: "runtime" },

  { name: "conflictCivilianLossHistory", category: "runtime" },

  { name: "conflictCapacityObligations", category: "runtime" },

  {
    name: "marketAdjustmentSignals",
    category: "runtime",
    notes:
      "Per-country loss share of funded capacity, 12 turns of history, written by the crisis spawner when the market adjustment stage is on. Turn-based, so it resets with the world.",
  },

  {
    name: "crisisAutoCooldowns",
    category: "runtime",
    notes:
      "Auto-crisis spawn cooldown (turn-based lastSpawnTurn). Previously survived resets, suppressing crisis spawns in the new world.",
  },

  {
    name: "crisisAlertState",
    category: "runtime",
    notes:
      "Last alerted decision-tree position per crisis, keyed by crisis id. Crisis ids are per world, so it resets with them.",
  },

  { name: "referendums", category: "runtime" },

  { name: "referendumWire", category: "runtime" },

  { name: "debateSessions", category: "runtime" },

  { name: "billDiscussions", category: "runtime" },

  { name: "billDiscussionReactions", category: "runtime" },

  // Per-country / per-state runtime + histories.
  { name: "countryLeaderStates", category: "runtime" },

  {
    name: "leaderLegacies",
    category: "runtime",
    notes:
      "One row per departed head of government: legacy score, its inputs and the decaying party shifts it gives. Turn-indexed, so it resets with the world.",
  },

  {
    name: "countryBriefs",
    category: "runtime",
    notes:
      "Background country briefs posted to the wire and the country page. Turn-indexed, so it resets with the world.",
  },

  { name: "characterStateOrg", category: "runtime" },

  {
    name: "primaryStateActions",
    category: "runtime",
    notes:
      "One row per act a presidential primary candidate has running against a rival in a state. Rows carry their own expiry, so a reset that drops them simply clears every live attack.",
  },

  { name: "rulingPartyPurgeEvents", category: "runtime" },

  { name: "redistrictLedger", category: "runtime" },

  { name: "stateApprovalHistory", category: "runtime" },

  { name: "stateMetricHistory", category: "runtime" },

  {
    name: "macroMetricsHistory",
    category: "runtime",
    notes:
      "SP5: the macro slice of the per-turn metric history (formerly stateMetricHistory's economic/population series). Wiped on reset, rebuilt by play.",
  },

  {
    name: "approvalTelemetry",
    category: "runtime",
    notes:
      "Durable long-horizon approval series (#2099): one doc per (world, country, region, turn), every turn retained under the world-raw-full policy. Wiped on reset, rebuilt by play.",
  },

  {
    name: "macroTelemetry",
    category: "runtime",
    notes:
      "Durable long-horizon GDP/population series (#2100): one doc per (world, country, region, metric, turn), every turn retained under the world-raw-full policy. Wiped on reset, rebuilt by play.",
  },

  {
    name: "countryTurnTelemetry",
    category: "runtime",
    notes:
      "Research country-turn macro, monetary and fiscal panel (#2331, #2336): one doc per (world, country, turn) under the world-raw-full policy. Wiped on reset, rebuilt by play.",
  },

  {
    name: "securityTelemetry",
    category: "runtime",
    notes:
      "Research securities panel (#2332): one doc per (world, turn) holding every listed equity and live bond observed that turn. Wiped on reset, rebuilt by play.",
  },

  {
    name: "parliamentSeatsHistory",
    category: "runtime",
    notes: "Per-turn parliament composition snapshots (capped history), written by the turn phase.",
  },

  {
    name: "corporationCountryHistory",
    category: "runtime",
    notes: "Per-turn per-country corporation aggregate snapshots (capped history).",
  },

  { name: "voteTallies", category: "runtime" },

  { name: "corporationShareInvites", category: "runtime" },

  { name: "wealthListHistory", category: "runtime" },

  { name: "wealthListSnapshots", category: "runtime" },

  {
    name: "analyticsRecords",
    category: "runtime",
    notes: "Current world wealth high-water mark for PostHog.",
  },

  {
    name: "seedDiagnostics",
    category: "runtime",
    notes:
      "Seed self-diagnostic reports (conformance + drift). Wiped on reset; re-populated in Phase 4 after bootstrap. Capped to last 50 docs on insert.",
  },

  {
    name: "seedDiagnosticBaselines",
    category: "runtime",
    notes:
      "Singleton baseline snapshot ({_id:'current'}) captured post-reset after conformance. Wiped on reset; re-captured in Phase 4b when conformance has no criticals.",
  },

  // ── 2026-07 backfill: gameplay state added since the last manifest sweep ──
  {
    name: "acquisitionOffers",
    category: "runtime",
    notes: "Corporate acquisition offers (corporations/[id]/deals). Owned by gameplay.",
  },
];
