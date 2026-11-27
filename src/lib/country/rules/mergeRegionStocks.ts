import { seedCapitalStock } from "@/lib/metricEngine/capitalStock";
import { mergeFiscalBooks } from "./mergeFiscalBooks";
import type { FederalBudget } from "@/lib/db/types/federalBudget";

function sum(a: unknown, b: unknown): number {
  const left = a ?? 0,
    right = b ?? 0;
  if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left + right))
    throw new Error("Invalid regional stock");
  return left + right;
}
export function mergeNumericStocks(
  target: Record<string, number> = {},
  source: Record<string, number> = {}
) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) result[key] = sum(result[key], value);
  return result;
}
export function mergeRegionFiscalStocks(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  origin: string
) {
  const result: Record<string, unknown> = {};
  if (source.balance !== undefined) result.balance = sum(target.balance, source.balance);
  if (source.financing) {
    const from = source.financing as Record<string, unknown>,
      to = (target.financing ?? {}) as Record<string, unknown>;
    const finance = { ...from, ...to };
    for (const field of [
      "principal",
      "cash",
      "annualInterest",
      "borrowed",
      "repaid",
      "interestPaid",
    ])
      finance[field] = sum(to[field], from[field]);
    finance.lastSettledTurn = Math.max(
      Number(to.lastSettledTurn ?? 0),
      Number(from.lastSettledTurn ?? 0)
    );
    result.financing = finance;
  }
  Object.assign(
    result,
    mergeFiscalBooks(source as Partial<FederalBudget>, target as Partial<FederalBudget>, 1, origin)
  );
  const programs = { ...((target.regionalProgramSettlements as Record<string, unknown>) ?? {}) };
  for (const [key, value] of Object.entries(
    (source.regionalProgramSettlements as Record<string, unknown>) ?? {}
  )) {
    const id = programs[key] === undefined ? key : `${origin}:${key}`;
    if (programs[id] !== undefined) throw new Error("Regional obligation key already exists");
    programs[id] = value;
  }
  if (source.regionalProgramSettlements) result.regionalProgramSettlements = programs;
  return result;
}
export function mergedRegionCapital(
  source: { gdp?: number; capitalStock?: number },
  target: { gdp?: number; capitalStock?: number }
) {
  return sum(
    source.capitalStock ?? seedCapitalStock(source.gdp ?? 0),
    target.capitalStock ?? seedCapitalStock(target.gdp ?? 0)
  );
}

export function mergeConflictCapacityApplied(
  source: Record<string, { destroyed: number; repaired: number }> = {},
  target: Record<string, { destroyed: number; repaired: number }> = {}
) {
  const result = { ...target };
  for (const [key, row] of Object.entries(source))
    result[key] = {
      destroyed: sum(result[key]?.destroyed, row.destroyed),
      repaired: sum(result[key]?.repaired, row.repaired),
    };
  return result;
}
