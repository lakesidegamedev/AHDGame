"use client";

import { ACTION_CAP, ACTION_HOARDING_THRESHOLD } from "@/lib/actions/recommendationsConstants";
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

export interface CorpHistoryPoint {
  turn: number;
  /** Absent for a private corporation, which has no market price. */
  sharePrice?: number;
  marketingStrength: number;
  liquidCapital: number;
}

export interface CorpStats {
  sequentialId: number;
  name: string;
  tickerSymbol?: string;
  /** True for a private corporation; its payload carries no quote or change. */
  isPrivate?: boolean;
  sharePrice?: number;
  priceChange1h?: number;
  liquidCapital: number;
  liquidCurrencyCode?: string;
  marketingStrength: number;
  ceoSalary: number;
  history: CorpHistoryPoint[];
}

export interface ElectionHistoryPoint {
  turn: number;
  pct: number;
  seats: number | null;
}

export interface ElectionStats {
  electionId: string;
  isMultiSeat: boolean;
  totalSeats: number | null;
  myVotePct: number;
  /** Positive = I lead, negative = trailing vs leader. Null if only candidate. */
  marginPct: number | null;
  seatsProjected: number | null;
  history: ElectionHistoryPoint[];
}

/** Per-turn campaign fund (CF) income breakdown — amounts in internal units (₳ scale). */
export interface CampaignIncomeBreakdown {
  populationTier: string;
  baseGen: number;
  donorBonus: number;
  officeBonus: number;
  unionContribution: number;
  stateTax: number;
  nationalTax: number;
  totalTax: number;
  netPerTurn: number;
}

export interface CharacterStats {
  /** The character these figures belong to; lets a refetch detect a switch made elsewhere. */
  characterId?: string;
  name: string;
  actions: number;
  /** Per-turn action cap, scaled by the character's Energy stat (200–250). */
  actionCap: number;
  /** Action count above which the hoarding penalty applies, Energy-scaled (100–125). */
  hoardThreshold: number;
  /** Campaign funds in internal/anchor units for affordability logic. */
  funds: number;
  /** Stored campaign-fund balance in home/local currency. */
  campaignFundsStored: number;
  /** Total liquid personal cash converted to internal/anchor units for aggregate comparisons. */
  cashOnHand: number;
  /**
   * Liquid home-currency cash only (no savings, no foreign). This is what the
   * player can actually spend from their wallet before auto-converting — the
   * intuitive "cash on hand" the status bar chip should show.
   */
  personalHomeLiquid: number;
  homeCurrency: string;
  corp: CorpStats | null;
  projectedIncome: number | null;
  /** Hourly CF income lines for status bar tooltip (same logic as profile Campaign Cash breakdown). */
  campaignIncomeBreakdown: CampaignIncomeBreakdown | null;
  donorBaseLevel: number;
  politicalInfluence: number;
  favorability: number;
  currentOfficeType: string | null;
  /** True when this character is the sitting chair of any central bank. */
  isCentralBankChair: boolean;
  /** Per-turn chair bonus (from GameConfig.chairActionBonus). 0 when not chair. */
  chairActionBonus: number;
  /** Per-turn base action grant (from GameConfig.baseActionsPerTurn). */
  baseActionsPerTurn: number;
  /** Per-turn office bonus (legislative seat + cabinet bonus, stacked; see resolveOfficeActionBonus). */
  officeActionBonus: number;
  /** Per-turn bonus actions from party-influence share. */
  bonusActionsFromParty: number;
  dividendIncome: number;
  bondIncome: number;
  electionStats: ElectionStats | null;
}

interface CharacterStatsContextValue {
  stats: CharacterStats | null;
  setStats: (stats: CharacterStats | null) => void;
  /** Patch individual fields (e.g. after an action spend) without a full refetch */
  patchStats: (patch: Partial<CharacterStats>) => void;
}

const CharacterStatsContext = createContext<CharacterStatsContextValue | null>(null);

export function CharacterStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<CharacterStats | null>(null);

  const patchStats = useCallback((patch: Partial<CharacterStats>) => {
    setStats((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  // Memoized so the 60s StatusBar poll only re-renders consumers when `stats`
  // actually changes, not because the provider re-rendered.
  const value = useMemo(() => ({ stats, setStats, patchStats }), [stats, patchStats]);

  return <CharacterStatsContext.Provider value={value}>{children}</CharacterStatsContext.Provider>;
}

export function useCharacterStats(): CharacterStatsContextValue {
  const ctx = useContext(CharacterStatsContext);
  if (!ctx) throw new Error("useCharacterStats must be used within CharacterStatsProvider");
  return ctx;
}

/**
 * Map a `/api/client-status` response into a `patchStats` payload. Only fields
 * actually present in the response are included, so a partial refetch never
 * clobbers existing context state with `undefined`. Shared by every status-bar
 * refetch trigger (turn change, tab focus, polling, on-demand trade events) so
 * they all stay in sync.
 */
export function buildStatusPatch(data: Record<string, unknown>): Partial<CharacterStats> {
  const patch: Partial<CharacterStats> = {};
  if (typeof data.actions === "number") patch.actions = data.actions;
  if (typeof data.funds === "number") patch.funds = data.funds;
  if (typeof data.campaignFundsStored === "number")
    patch.campaignFundsStored = data.campaignFundsStored;
  if (typeof data.cashOnHand === "number") patch.cashOnHand = data.cashOnHand;
  if (typeof data.personalHomeLiquid === "number")
    patch.personalHomeLiquid = data.personalHomeLiquid;
  if (data.campaignIncomeBreakdown !== undefined)
    patch.campaignIncomeBreakdown =
      (data.campaignIncomeBreakdown as CampaignIncomeBreakdown | null) ?? null;
  if (data.corpNav !== undefined) patch.corp = (data.corpNav as CorpStats | null) ?? null;
  if (data.electionStats !== undefined)
    patch.electionStats = (data.electionStats as ElectionStats | null) ?? null;
  if (typeof data.dividendIncome === "number") patch.dividendIncome = data.dividendIncome;
  if (typeof data.bondIncome === "number") patch.bondIncome = data.bondIncome;
  if (typeof data.projectedIncome === "number") patch.projectedIncome = data.projectedIncome;
  if (typeof data.politicalInfluence === "number")
    patch.politicalInfluence = data.politicalInfluence;
  if (typeof data.favorability === "number") patch.favorability = data.favorability;
  return patch;
}

/** The `/api/client-status` fields buildStatusStats reads; every one may be absent. */
export type ClientStatusPayload = Partial<Omit<CharacterStats, "corp" | "characterId">> & {
  characterId?: unknown;
  corpNav?: CorpStats | null;
};

/** Whole-object mapping of a `/api/client-status` response, defaults for absent fields. */
export function buildStatusStats(data: ClientStatusPayload): CharacterStats {
  return {
    characterId: typeof data.characterId === "string" ? data.characterId : undefined,
    name: data.name ?? "",
    actions: data.actions ?? 0,
    actionCap: data.actionCap ?? ACTION_CAP,
    hoardThreshold: data.hoardThreshold ?? ACTION_HOARDING_THRESHOLD,
    funds: data.funds ?? 0,
    campaignFundsStored: data.campaignFundsStored ?? data.funds ?? 0,
    cashOnHand: data.cashOnHand ?? 0,
    personalHomeLiquid: data.personalHomeLiquid ?? data.cashOnHand ?? 0,
    homeCurrency: data.homeCurrency ?? "USD",
    corp: data.corpNav ?? null,
    projectedIncome: data.projectedIncome ?? null,
    campaignIncomeBreakdown: data.campaignIncomeBreakdown ?? null,
    donorBaseLevel: data.donorBaseLevel ?? 0,
    politicalInfluence: data.politicalInfluence ?? 0,
    favorability: data.favorability ?? 0,
    currentOfficeType: data.currentOfficeType ?? null,
    isCentralBankChair: data.isCentralBankChair ?? false,
    chairActionBonus: data.chairActionBonus ?? 0,
    baseActionsPerTurn: data.baseActionsPerTurn ?? 4,
    officeActionBonus: data.officeActionBonus ?? 0,
    bonusActionsFromParty: data.bonusActionsFromParty ?? 0,
    dividendIncome: data.dividendIncome ?? 0,
    bondIncome: data.bondIncome ?? 0,
    electionStats: data.electionStats ?? null,
  };
}

/** True when a status response belongs to a different character than the held stats. */
export function statusIsForOtherCharacter(
  held: Pick<CharacterStats, "characterId"> | null,
  data: Record<string, unknown>
): boolean {
  return (
    !!held?.characterId &&
    typeof data.characterId === "string" &&
    data.characterId !== held.characterId
  );
}
