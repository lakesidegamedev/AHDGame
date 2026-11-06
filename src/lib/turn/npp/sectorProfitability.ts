import type { CorporateSector } from "@/lib/db/types";
import { decisionProfit } from "@/lib/market/producerMarket/internalTransferPricingRules";

export interface SectorProfitInfo {
  sector: CorporateSector;
  income: number;
  margin: number;
  isProfitable: boolean;
  marginCategory: "loss" | "thin" | "healthy" | "strong";
}

/**
 * Classifies the last measured result of each sector for NPP decisions. With
 * `managementAccounts` (own-site deliveries at market value), a plant is read
 * on its management account (decisionProfit), so output its own company took
 * is not a loss and the receiving site carries the charge.
 */
export function analyzeSectorProfitability(
  sectors: CorporateSector[],
  preferPhysicalPnl = false,
  managementAccounts = false
): SectorProfitInfo[] {
  return sectors.map((sector) => {
    const booked = preferPhysicalPnl ? sector.plantsPnl : undefined;
    const physicalPnl = booked
      ? managementAccounts
        ? {
            revenue: booked.revenue + Math.max(0, booked.internalSupplyIncome ?? 0),
            profit: decisionProfit(booked, true),
          }
        : booked
      : undefined;
    const revenue = physicalPnl?.revenue ?? sector.revenue ?? 0;
    const margin =
      physicalPnl && physicalPnl.revenue > 0
        ? (100 * physicalPnl.profit) / physicalPnl.revenue
        : (sector.effectiveProfitMargin ?? sector.profitMargin ?? 0);
    const income = physicalPnl?.profit ?? revenue * (margin / 100);
    const isProfitable = income > 0;
    const marginCategory: SectorProfitInfo["marginCategory"] =
      margin < 0 ? "loss" : margin < 10 ? "thin" : margin < 25 ? "healthy" : "strong";
    return { sector, income, margin, isProfitable, marginCategory };
  });
}

/** NPP decision read: physical P&L when plants are on, management accounts at stage 3. */
export function nppSectorProfitability(
  sectors: CorporateSector[],
  plants?: { enabled?: boolean; captiveMarketValue?: boolean }
): SectorProfitInfo[] {
  return analyzeSectorProfitability(
    sectors,
    plants?.enabled === true,
    plants?.captiveMarketValue === true
  );
}
