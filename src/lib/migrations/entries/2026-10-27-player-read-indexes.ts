import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

/**
 * Indexes for reads that were scanning whole collections on every page view
 * or every minute. Each plan names the query shape it serves; the shapes come
 * from the production slow-query log.
 */
const INDEXES: IndexPlan[] = [
  // Corporation trade tape, holder history, recent trades by kind and the
  // per-corporation trade count all filter on one corporation and read by time.
  {
    collection: "shareTradeHistory",
    keys: { corporationId: 1, createdAt: -1 },
    options: { name: "shareTradeHistory_corporation_createdAt" },
  },
  // Split and buyback history for a set of corporations reads in turn order.
  {
    collection: "shareTradeHistory",
    keys: { corporationId: 1, turn: 1 },
    options: { name: "shareTradeHistory_corporation_turn" },
  },
  // Market-wide volume charts: trades since a time, or within a turn range.
  {
    collection: "shareTradeHistory",
    keys: { createdAt: -1 },
    options: { name: "shareTradeHistory_createdAt" },
  },
  {
    collection: "shareTradeHistory",
    keys: { turn: 1 },
    options: { name: "shareTradeHistory_turn" },
  },
  // A player's own trade history is an $or over buyer and seller (character and
  // imperial character); every branch needs an index or the whole $or scans.
  {
    collection: "shareTradeHistory",
    keys: { "from.characterId": 1, turn: 1 },
    options: { name: "shareTradeHistory_from_character" },
  },
  {
    collection: "shareTradeHistory",
    keys: { "to.characterId": 1, turn: 1 },
    options: { name: "shareTradeHistory_to_character" },
  },
  {
    collection: "shareTradeHistory",
    keys: { "from.imperialCharacterId": 1, turn: 1 },
    options: { name: "shareTradeHistory_from_imperial", sparse: true },
  },
  {
    collection: "shareTradeHistory",
    keys: { "to.imperialCharacterId": 1, turn: 1 },
    options: { name: "shareTradeHistory_to_imperial", sparse: true },
  },
  // The corporation page's portfolio value chart (latest N turns of one corp).
  {
    collection: "corporationPortfolioHistory",
    keys: { corporationId: 1, turn: -1 },
    options: { name: "corporationPortfolioHistory_corporation_turn" },
  },
  // A corporation's supply agreements as supplier or buyer.
  {
    collection: "supplyAgreements",
    keys: { supplierCorpId: 1, status: 1 },
    options: { name: "supplyAgreements_supplier_status" },
  },
  {
    collection: "supplyAgreements",
    keys: { buyerCorpId: 1, status: 1 },
    options: { name: "supplyAgreements_buyer_status" },
  },
  // Bonds a corporation issued, bonds a character holds, and one country's
  // live sovereign bonds.
  {
    collection: "bonds",
    keys: { corporationId: 1, matured: 1 },
    options: { name: "bonds_corporation_matured" },
  },
  {
    collection: "bonds",
    keys: { "holders.characterId": 1, matured: 1 },
    options: { name: "bonds_holderCharacter_matured" },
  },
  {
    collection: "bonds",
    keys: { issuerType: 1, countryId: 1, matured: 1 },
    options: { name: "bonds_issuer_country_matured" },
  },
  // A player's holdings: every corporation listing a character as shareholder
  // (portfolio, profile and share pages).
  {
    collection: "corporations",
    keys: { "shareholders.characterId": 1 },
    options: { name: "corporations_shareholder_character" },
  },
  // The Treasury phase groups a country's open coupon queue once per turn:
  // its oldest due turn, its smallest claim and which countries still owe one.
  // The budget-prefixed indexes cannot bound `settledTurn` from the left, so
  // that grouping fetched every open claim document on every pass. With this
  // order the same grouping is a covered walk of the open range. The banking
  // seed creates the same index.
  {
    collection: "sovereignCouponClaims",
    keys: { settledTurn: 1, budgetId: 1, "claim.dueTurn": 1, "claim.amountLocal": 1 },
    options: { name: "sovereignCouponClaims_open_queue" },
  },
  // The money journal prune runs every minute and looks for old applied or
  // rejected moves of the prunable kinds. With only the turn index it fetched
  // every old move (tens of thousands of large documents) to find one batch.
  {
    collection: "bankMoneyMoves",
    keys: { kind: 1, status: 1, turn: 1 },
    options: { name: "bankMoneyMoves_kind_status_turn" },
  },
  // Primary snapshots recorded so far this turn, read once per turn and once
  // per half-hour tick to keep a re-run turn idempotent. The existing
  // { electionId, recordedAt } index cannot bound `turn`, so it fetched every
  // snapshot the race has ever recorded and filtered in memory.
  {
    collection: "primarySnapshots",
    keys: { electionId: 1, turn: 1 },
    options: { name: "primarySnapshots_election_turn" },
  },
];

export const migration: Migration = {
  id: "2026-10-27-player-read-indexes",
  description:
    "Indexes for corporation, shareholder, trade, bond and supply agreement page reads and the money journal prune, which were scanning whole collections.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
