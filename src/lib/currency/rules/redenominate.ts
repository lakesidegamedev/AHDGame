import type { DepartmentAccount } from "@/lib/db/types/federalBudget";
import type { RegionalDebtLedger } from "@/lib/budget/rules/regionalDebt";

function requireScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid currency scale");
}

function scaleFields<T extends object>(value: T, fields: readonly (keyof T)[], scale: number): T {
  return {
    ...value,
    ...Object.fromEntries(
      fields.flatMap((field) => {
        const amount = value[field];
        if (amount === undefined) return [];
        if (
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          !Number.isFinite(amount * scale)
        )
          throw new Error("Invalid money field in currency conversion");
        return [[field, amount * scale]];
      })
    ),
  };
}

export function redenominateRegionalFinancing(
  value: RegionalDebtLedger,
  scale: number
): RegionalDebtLedger {
  requireScale(scale);
  return scaleFields(
    value,
    ["principal", "cash", "annualInterest", "borrowed", "repaid", "interestPaid"],
    scale
  );
}

function redenominateDepartment(account: DepartmentAccount, scale: number): DepartmentAccount {
  return {
    ...scaleFields(
      account,
      [
        "balance",
        "encumbered",
        "arrears",
        "annualAuthority",
        "operatingAuthority",
        "capitalAuthority",
        "transferAuthority",
      ],
      scale
    ),
    programs: Object.fromEntries(
      Object.entries(account.programs ?? {}).map(([id, program]) => [
        id,
        scaleFields(
          program,
          [
            "annualDemand",
            "periodDemand",
            "authorityThisTurn",
            "obligated",
            "encumbered",
            "outlaid",
            "cumulativeOutlays",
            "arrears",
          ],
          scale
        ),
      ])
    ),
  };
}

type NumericRecord = Record<string, number>;

function scaleMoneyRecord<T extends NumericRecord>(record: T, scale: number): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value * scale])
  ) as T;
}

interface FederalBudgetMoneyShape {
  revenue: NumericRecord;
  taxBases: NumericRecord;
  spending: { byCategory: NumericRecord };
  debt: NumericRecord;
  treasuryBalance: number;
  treasuryCashLocal?: number;
  departmentAccounts?: Record<string, DepartmentAccount>;
  imfSovereignFacilityPrincipalOutstanding?: number;
  surplus: number;
  gdp: number;
  gdpSmoothed?: number;
  militaryPriceBaselineGdp?: number;
  baselineSpendingByCategory: NumericRecord;
  baselineStateGrants: number;
  defenseAppropriation?: {
    balance: number;
    accruedThroughTurn: number;
    arrearsRatio: number;
    encumbered?: number;
  };
  intelligenceAppropriation?: { balance: number; accruedThroughTurn: number };
}

/** Pure denomination change. Rates, ratios, years and physical quantities stay unchanged. */
export function redenominateFederalBudget<T extends FederalBudgetMoneyShape>(
  doc: T,
  scale: number
) {
  requireScale(scale);
  const { byCategory, ...spendingScalars } = doc.spending;
  return {
    revenue: scaleMoneyRecord(doc.revenue, scale),
    taxBases: scaleMoneyRecord(doc.taxBases, scale),
    spending: {
      ...scaleMoneyRecord(spendingScalars as NumericRecord, scale),
      byCategory: scaleMoneyRecord(byCategory, scale),
    },
    debt: {
      ...doc.debt,
      principal: (doc.debt.principal ?? 0) * scale,
      ceiling: (doc.debt.ceiling ?? 0) * scale,
    } as T["debt"],
    treasuryBalance: doc.treasuryBalance * scale,
    ...(doc.treasuryCashLocal === undefined
      ? {}
      : { treasuryCashLocal: doc.treasuryCashLocal * scale }),
    ...(doc.imfSovereignFacilityPrincipalOutstanding === undefined
      ? {}
      : {
          imfSovereignFacilityPrincipalOutstanding:
            doc.imfSovereignFacilityPrincipalOutstanding * scale,
        }),
    ...(doc.departmentAccounts
      ? {
          departmentAccounts: Object.fromEntries(
            Object.entries(doc.departmentAccounts).map(([id, account]) => [
              id,
              redenominateDepartment(account, scale),
            ])
          ),
        }
      : {}),
    surplus: doc.surplus * scale,
    gdp: doc.gdp * scale,
    ...(doc.gdpSmoothed === undefined ? {} : { gdpSmoothed: doc.gdpSmoothed * scale }),
    ...(doc.militaryPriceBaselineGdp === undefined
      ? {}
      : { militaryPriceBaselineGdp: doc.militaryPriceBaselineGdp * scale }),
    baselineSpendingByCategory: scaleMoneyRecord(doc.baselineSpendingByCategory, scale),
    baselineStateGrants: doc.baselineStateGrants * scale,
    ...(doc.defenseAppropriation
      ? {
          defenseAppropriation: {
            ...doc.defenseAppropriation,
            balance: doc.defenseAppropriation.balance * scale,
            ...(doc.defenseAppropriation.encumbered === undefined
              ? {}
              : { encumbered: doc.defenseAppropriation.encumbered * scale }),
          },
        }
      : {}),
    ...(doc.intelligenceAppropriation
      ? {
          intelligenceAppropriation: {
            ...doc.intelligenceAppropriation,
            balance: doc.intelligenceAppropriation.balance * scale,
          },
        }
      : {}),
  };
}

interface StateBudgetMoneyShape {
  financing?: RegionalDebtLedger;
  revenue: NumericRecord;
  taxBases: NumericRecord;
  spending: { byCategory: NumericRecord };
  balance: number;
  surplus: number;
  stateGdp: number;
}

export function redenominateStateBudget<T extends StateBudgetMoneyShape>(doc: T, scale: number) {
  requireScale(scale);
  const { byCategory, ...spendingScalars } = doc.spending;
  return {
    revenue: scaleMoneyRecord(doc.revenue, scale),
    taxBases: scaleMoneyRecord(doc.taxBases, scale),
    spending: {
      ...scaleMoneyRecord(spendingScalars as NumericRecord, scale),
      byCategory: scaleMoneyRecord(byCategory, scale),
    },
    balance: doc.balance * scale,
    ...(doc.financing ? { financing: redenominateRegionalFinancing(doc.financing, scale) } : {}),
    surplus: doc.surplus * scale,
    stateGdp: doc.stateGdp * scale,
  };
}
