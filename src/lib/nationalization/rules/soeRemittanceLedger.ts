import type { LedgerLeg } from "@/lib/ledger/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

export function soeRemittanceCashLegs(input: {
  corporation: string;
  country: string;
  corporationCurrency: CurrencyCode;
  treasuryCurrency: CurrencyCode;
  amount: number;
  treasuryAmount: number;
  corporationRate: number;
  treasuryRate: number;
}): LedgerLeg[] {
  const legs: LedgerLeg[] = [];
  const pair = (
    account: string,
    contra: string,
    amount: number,
    currencyCode: CurrencyCode,
    rate: number
  ) => {
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Invalid SOE remittance witness");
    legs.push(
      { account, amount, currencyCode, anchorAmount: amount / rate, role: "primary" },
      {
        account: contra,
        amount: -amount,
        currencyCode,
        anchorAmount: -amount / rate,
        role: "contra",
      }
    );
  };
  pair(
    `corporation:${input.corporation}:${input.corporationCurrency}`,
    `sink:soe_remittance:${input.corporationCurrency}`,
    -input.amount,
    input.corporationCurrency,
    input.corporationRate
  );
  pair(
    `government_cash:${input.country}:${input.treasuryCurrency}`,
    `mint:soe_remittance:${input.treasuryCurrency}`,
    input.treasuryAmount,
    input.treasuryCurrency,
    input.treasuryRate
  );
  pair(
    `government:${input.country}:${input.treasuryCurrency}`,
    `government_cash:${input.country}:${input.treasuryCurrency}`,
    input.treasuryAmount,
    input.treasuryCurrency,
    input.treasuryRate
  );
  return legs;
}
