import type {
  FederalBudget,
  DepartmentAccount,
  DepartmentProgramState,
} from "@/lib/db/types/federalBudget";

const sumMoney = (a: number | undefined, b: number | undefined) => {
  const sum = (a ?? 0) + (b ?? 0);
  if (!Number.isFinite(sum)) throw new Error("Invalid fiscal stock");
  return sum;
};
const accountMoney = [
  "balance",
  "encumbered",
  "arrears",
  "annualAuthority",
  "operatingAuthority",
  "capitalAuthority",
  "transferAuthority",
] as const;
const programMoney = [
  "annualDemand",
  "periodDemand",
  "authorityThisTurn",
  "obligated",
  "encumbered",
  "outlaid",
  "cumulativeOutlays",
  "arrears",
] as const;
function scaled<T extends object>(source: T, fields: readonly string[], scale: number): T {
  const copy = { ...source } as Record<string, unknown>;
  for (const field of fields)
    if (copy[field] !== undefined) {
      const value = copy[field];
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(value * scale))
        throw new Error("Invalid fiscal stock");
      copy[field] = value * scale;
    }
  return copy as T;
}
/** Preserve distinct programmes and physical pools rather than overwriting a colliding old-country book. */
function retainEntries<T>(
  target: Record<string, T>,
  source: Record<string, T>,
  origin: string
): Record<string, T> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const id = result[key] === undefined ? key : `${origin}:${key}`;
    if (result[id] !== undefined) throw new Error("Fiscal successor key already exists");
    result[id] = value;
  }
  return result;
}
export function mergeFiscalBooks(
  from: Partial<FederalBudget>,
  to: Partial<FederalBudget>,
  scale: number,
  origin: string
) {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid fiscal exchange quote");
  const result: Record<string, unknown> = {};
  if (from.treasuryCashLocal !== undefined)
    result.treasuryCashLocal = sumMoney(to.treasuryCashLocal, from.treasuryCashLocal * scale);
  if (from.defenseAppropriation) {
    const source = scaled(from.defenseAppropriation, ["balance", "encumbered"], scale),
      target = to.defenseAppropriation;
    const reservations = Object.fromEntries(
      Object.entries(source.governmentTenderReservations ?? {}).map(([key, row]) => [
        key,
        scaled(row, ["amount"], scale),
      ])
    );
    result.defenseAppropriation = {
      ...(target ?? source),
      balance: sumMoney(target?.balance, source.balance),
      encumbered: sumMoney(target?.encumbered, source.encumbered),
      accruedThroughTurn: Math.max(target?.accruedThroughTurn ?? 0, source.accruedThroughTurn ?? 0),
      governmentTenderReservations: retainEntries(
        target?.governmentTenderReservations ?? {},
        reservations,
        origin
      ),
    };
  }
  if (from.intelligenceAppropriation)
    result.intelligenceAppropriation = {
      ...(to.intelligenceAppropriation ?? from.intelligenceAppropriation),
      balance: sumMoney(
        to.intelligenceAppropriation?.balance,
        from.intelligenceAppropriation.balance * scale
      ),
      accruedThroughTurn: Math.max(
        to.intelligenceAppropriation?.accruedThroughTurn ?? 0,
        from.intelligenceAppropriation.accruedThroughTurn ?? 0
      ),
    };
  if (from.departmentAccounts) {
    const accounts = { ...to.departmentAccounts };
    for (const [id, original] of Object.entries(from.departmentAccounts)) {
      const source = scaled(original, accountMoney, scale),
        target = accounts[id];
      const programs = Object.fromEntries(
        Object.entries(source.programs ?? {}).map(([key, program]) => [
          key,
          scaled(program, programMoney, scale),
        ])
      ) as Record<string, DepartmentProgramState>;
      if (!target) {
        accounts[id] = { ...source, programs };
        continue;
      }
      const combined = { ...target } as DepartmentAccount;
      for (const field of accountMoney)
        if (source[field] !== undefined) combined[field] = sumMoney(target[field], source[field]);
      combined.accruedThroughTurn = Math.max(target.accruedThroughTurn, source.accruedThroughTurn);
      combined.programs = retainEntries(target.programs, programs, origin);
      combined.capacityPools = retainEntries(target.capacityPools, source.capacityPools, origin);
      accounts[id] = combined;
    }
    result.departmentAccounts = accounts;
  }
  return result;
}
