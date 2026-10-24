/**
 * Income-tax funding: pay the assessed wallet first, then buy any shortfall
 * from the payer's other personal currency wallets at market rates.
 * `exchangeRates.rate` is local units per anchor, the same direction
 * `playerTaxWalletDebit` uses, so `owed / sourceFx` anchor of liability buys
 * `(owed / sourceFx) * walletRate` of another wallet's currency.
 */
export interface TaxFundingLeg {
  currency: string;
  amount: number;
  anchorAmount: number;
}
export interface TaxFundingPlan {
  /** Debit from the assessed wallet, in the assessed currency. */
  primary: number;
  /** Debits from other personal wallets, each in its own currency. */
  converted: TaxFundingLeg[];
  /** Rounding excess, retired so the settled liability stays whole. */
  rounding: TaxFundingLeg | null;
  /** True only when the plan covers the whole liability; otherwise it takes nothing. */
  funded: boolean;
}
export interface TaxFundingInput {
  /** Liability in assessed-currency units. */
  owed: number;
  /** Assessed-currency units per anchor. */
  sourceFx: number;
  /** The assessed wallet's currency. */
  currency: string;
  /** Spendable balance in the assessed wallet. */
  primaryAvailable: number;
  /** Spendable balances in the payer's other personal wallets. */
  available: Partial<Record<string, number>>;
  /** Live rates: wallet-currency units per anchor. */
  rates: Partial<Record<string, number>>;
}
/** Converted debits are charged in whole cents or yen, never fractions of one. */
export function ceilTaxAmount(amount: number, currency: string): number {
  const unit = currency === "JPY" ? 1 : 0.01;
  return Number((Math.ceil(amount / unit - 1e-9) * unit).toFixed(currency === "JPY" ? 0 : 2));
}
export function planTaxFunding(input: TaxFundingInput): TaxFundingPlan {
  const empty: TaxFundingPlan = { primary: 0, converted: [], rounding: null, funded: false };
  const { owed, sourceFx, currency, primaryAvailable, available, rates } = input;
  if (!Number.isFinite(owed) || owed <= 0 || !Number.isFinite(sourceFx) || sourceFx <= 0)
    return empty;
  if (!Number.isFinite(primaryAvailable)) return empty;
  const owedAnchor = owed / sourceFx;
  const primary = Math.min(Math.max(0, primaryAvailable), owed);
  let collectedAnchor = primary / sourceFx;
  if (collectedAnchor >= owedAnchor - 1e-9)
    return { primary, converted: [], rounding: null, funded: true };
  // Largest anchor value first, so a conversion touches as few wallets as possible.
  const candidates = (Object.entries(available) as Array<[string, number]>)
    .filter(
      ([code, balance]) =>
        code !== currency &&
        Number.isFinite(balance) &&
        balance > 0 &&
        Number.isFinite(rates[code]) &&
        (rates[code] ?? 0) > 0
    )
    .sort((a, b) => b[1] * (rates[b[0]] ?? 0) - a[1] * (rates[a[0]] ?? 0));
  const converted: TaxFundingLeg[] = [];
  let remainingAnchor = owedAnchor - collectedAnchor;
  for (const [code, balance] of candidates) {
    if (remainingAnchor <= 1e-9) break;
    const rate = rates[code]!;
    const amount = Math.min(ceilTaxAmount(remainingAnchor * rate, code), balance);
    if (!(amount > 0)) continue;
    const anchorAmount = amount / rate;
    converted.push({ currency: code, amount, anchorAmount });
    collectedAnchor += anchorAmount;
    remainingAnchor = owedAnchor - collectedAnchor;
  }
  if (remainingAnchor > 1e-9) return empty;
  const excess = collectedAnchor - owedAnchor;
  const last = converted.at(-1);
  let rounding: TaxFundingLeg | null = null;
  if (excess > 1e-9 && last) {
    const amount = Number(
      (excess * (rates[last.currency] ?? 0)).toFixed(last.currency === "JPY" ? 0 : 2)
    );
    if (amount > 0) rounding = { currency: last.currency, amount, anchorAmount: excess };
  }
  return { primary, converted, rounding, funded: true };
}
