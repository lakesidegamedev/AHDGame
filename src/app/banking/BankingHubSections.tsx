"use client";
import { apiErrorText } from "@/lib/errors/catalog";
import { useState } from "react";
import { useSavingsRequest } from "@/lib/savings/useSavingsRequest";
import Link from "next/link";
import { ArrowRight, Landmark, PiggyBank, Wallet, WalletCards } from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";
import { Badge, EmptyState } from "@/components/ui";

import { WarningBandBadge } from "@/components/banking/WarningBandBadge";
import { formatBankMoney, formatRatePercent } from "@/components/banking/formatBankMoney";

import { CorporationLogo } from "@/components/corporation/CorporationLogo";
import { Avatar } from "@/components/Avatar";
import { CHARACTER_LOAN_SPREAD_PP, convertFaceBetweenCurrencies } from "@/lib/banking/lendingMath";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { BankCharterType } from "@/lib/db/types/bank";

export type HubCentralBank = {
  currency: CurrencyCode;
  bankName: string;
  countryId: CountryId;
  countryName: string;
  href: string;
  primeRate: number;
  savingsApyPercent: number;
  isPrimary: boolean;
};

export type HubPrivateBank = {
  corporationId: string;
  sequentialId: number | null;
  name: string;
  countryId: CountryId;
  countryName: string;
  currency: CurrencyCode;
  operatorType: "player" | "npp";
  charterType: BankCharterType;
  depositRatePercent: number;
  saverApyPercent: number;
  lendingRatePercent: number;
  warningBand: "green" | "amber" | "red" | null;
  confidence: number | null;
  totalDeposits: number;
  cashReserves: number;
  lendableHeadroom: number;
  requireApproval?: boolean;
  logoUrl?: string;
  ceoName: string | null;
  ceoAvatarUrl: string | null;
  href: string;
};

export type HubSavingsRow = {
  currency: CurrencyCode;
  balance: number;
  currentHolder: "centralBank" | string;
  options: Array<{
    holder: "centralBank" | string;
    label: string;
    depositRatePercent: number;
  }>;
};

export type HubTab = "central" | "private" | "accounts";

export function charterLabel(type: BankCharterType): string {
  if (type === "retail") return "Retail";
  if (type === "investment") return "Investment";
  return "Universal";
}

export function BankingHero({
  primary,
  privateBankingEnabled,
  hasCharacter,
  primaryCurrency,
  personalCash,
  savingsBalances,
  displayFxRates,
  onNavigate,
}: {
  primary: HubCentralBank | undefined;
  privateBankingEnabled: boolean;
  hasCharacter: boolean;
  primaryCurrency: CurrencyCode;
  personalCash: Partial<Record<CurrencyCode, number>>;
  savingsBalances: Partial<Record<CurrencyCode, number>>;
  displayFxRates: Partial<Record<CurrencyCode, number>>;
  onNavigate: (tab: HubTab) => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-card-border bg-card shadow-lg">
      <div className="relative px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
        <div
          className={`grid gap-6 ${hasCharacter ? "xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]" : ""}`}
        >
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-body-sm font-medium text-primary">
              <span className="h-px w-7 bg-primary/70" aria-hidden />
              World financial system
            </div>
            <h1 className="mt-3 text-display font-bold tracking-tight text-foreground sm:text-display">
              Banking &amp; Credit
            </h1>
            <p className="mt-3 max-w-xl text-body leading-relaxed text-muted sm:text-body-lg">
              Follow monetary policy, compare chartered banks, and manage your savings and borrowing
              from one desk.
            </p>
            {privateBankingEnabled && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate("private")}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Browse private banks
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("accounts")}
                  className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card/70 px-3.5 py-2 text-body font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Deposit or borrow
                  <WalletCards className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {hasCharacter && (
            <YourFundsPanel
              personalCash={personalCash}
              savingsBalances={savingsBalances}
              primaryCurrency={primaryCurrency}
              fxRates={displayFxRates}
            />
          )}
        </div>

        {primary && (
          <div className="mt-7 overflow-hidden rounded-2xl border border-primary/25 bg-background">
            <div className="grid lg:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-4 p-4 sm:p-5">
                <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-card-border bg-card-elevated shadow-sm">
                  <CountryFlag
                    country={primary.countryId}
                    width={46}
                    height={31}
                    title={primary.countryName}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-primary">Your primary central bank</p>
                  <p className="mt-1 truncate text-body-lg font-bold text-foreground sm:text-heading">
                    {primary.bankName}
                  </p>
                  <p className="text-body-sm text-muted">
                    {primary.countryName} Â· {primary.currency}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-card-border lg:border-l lg:border-t-0">
                <HeroRate label="Prime rate" value={primary.primeRate} />
                <HeroRate
                  label="Savings APY"
                  value={primary.savingsApyPercent}
                  hint="Half the real rate: prime minus inflation"
                  divided
                />
              </div>
            </div>
            <Link
              href={primary.href}
              className="group flex items-center justify-between border-t border-card-border bg-primary/[0.06] px-4 py-3 text-body font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5"
            >
              Open policy desk
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export function HeroRate({
  label,
  value,
  hint,
  divided = false,
}: {
  label: string;
  value: number;
  hint?: string;
  divided?: boolean;
}) {
  return (
    <div
      className={`min-w-[125px] px-4 py-4 sm:px-6 ${divided ? "border-l border-card-border" : ""}`}
    >
      <p className="text-body-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-mono text-heading font-bold tabular-nums text-foreground">
        {formatRatePercent(value)}
      </p>
      {hint && <p className="mt-1 text-body-sm leading-tight text-muted">{hint}</p>}
    </div>
  );
}

export // â”€â”€ Hero "Your balances" panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function nonzeroBalances(
  balances: Partial<Record<CurrencyCode, number>>
): Array<[CurrencyCode, number]> {
  return (Object.entries(balances) as Array<[CurrencyCode, number]>)
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

export /** Display total of a multi-currency balance set, converted into `target`. */
function totalInCurrency(
  balances: Partial<Record<CurrencyCode, number>>,
  target: CurrencyCode,
  rates: Partial<Record<CurrencyCode, number>>
): number {
  let total = 0;
  for (const [code, amount] of Object.entries(balances) as Array<[CurrencyCode, number]>) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total +=
      code === target
        ? amount
        : convertFaceBetweenCurrencies(amount, code, target, rates[code] ?? 0, rates[target] ?? 0);
  }
  return total;
}

export function YourFundsPanel({
  personalCash,
  savingsBalances,
  primaryCurrency,
  fxRates,
}: {
  personalCash: Partial<Record<CurrencyCode, number>>;
  savingsBalances: Partial<Record<CurrencyCode, number>>;
  primaryCurrency: CurrencyCode;
  fxRates: Partial<Record<CurrencyCode, number>>;
}) {
  return (
    <aside
      aria-label="Your balances"
      className="self-start overflow-hidden rounded-2xl border border-primary/25 bg-background"
    >
      <p className="border-b border-card-border px-4 py-3 text-body-sm font-medium text-primary">
        Your balances
      </p>
      <div className="grid divide-y divide-card-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
        <FundsStat
          icon={Wallet}
          label="Liquid funds"
          total={totalInCurrency(personalCash, primaryCurrency, fxRates)}
          currency={primaryCurrency}
          entries={nonzeroBalances(personalCash)}
        />
        <FundsStat
          icon={PiggyBank}
          label="Savings"
          total={totalInCurrency(savingsBalances, primaryCurrency, fxRates)}
          currency={primaryCurrency}
          entries={nonzeroBalances(savingsBalances)}
        />
      </div>
      <p className="border-t border-card-border px-4 py-2.5 text-body-sm leading-relaxed text-muted">
        Totals converted to {primaryCurrency} at current exchange rates.
      </p>
    </aside>
  );
}

export function FundsStat({
  icon: Icon,
  label,
  total,
  currency,
  entries,
}: {
  icon: typeof Landmark;
  label: string;
  total: number;
  currency: CurrencyCode;
  entries: Array<[CurrencyCode, number]>;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-1.5 text-body-sm font-medium text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 font-mono text-heading font-bold tabular-nums text-foreground">
        {formatBankMoney(total, currency)}
      </p>
      {entries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {entries.map(([code, amount]) => (
            <span key={code} className="font-mono text-body-sm tabular-nums text-muted">
              {formatBankMoney(amount, code)} {code}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-body-sm text-muted">No balance yet</p>
      )}
    </div>
  );
}

export function PrivateBankRow({
  bank,
  estRateLabel,
  hasCharacter,
  onDeposit,
  onBorrow,
}: {
  bank: HubPrivateBank;
  estRateLabel: string;
  hasCharacter: boolean;
  onDeposit: () => void;
  onBorrow: () => void;
}) {
  const customerBank = bank.charterType === "retail" || bank.charterType === "universal";
  const estimatedRate = bank.lendingRatePercent + CHARACTER_LOAN_SPREAD_PP;

  return (
    <tr className="group transition-colors hover:bg-[color-mix(in_srgb,var(--background)_40%,var(--card))]">
      <td className="px-5 py-3.5">
        <Link
          href={bank.href}
          className="group flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-card-border bg-card-elevated">
            <CorporationLogo
              key={bank.logoUrl ?? bank.corporationId}
              logoUrl={bank.logoUrl}
              name={`${bank.name} logo`}
              size="h-10 w-10"
              className="rounded-lg"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground transition-colors group-hover:text-primary">
              {bank.name}
            </span>
            <span className="block truncate text-body-sm text-muted">
              {bank.countryName} Â· <span className="font-mono">{bank.currency}</span>
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-body-sm text-muted">
              <Avatar
                url={bank.ceoAvatarUrl}
                name={bank.ceoName ?? "CEO"}
                size="h-5 w-5"
                className="rounded-md"
              />
              <span className="truncate">{bank.ceoName ?? "CEO vacant"}</span>
            </span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={bank.operatorType === "player" ? "info" : "default"} variant="subtle">
            {bank.operatorType === "player" ? "Player-run" : "NPP-run"}
          </Badge>
          <Badge color="default" variant="subtle">
            {charterLabel(bank.charterType)}
          </Badge>
          {bank.requireApproval && (
            <Badge color="warning" variant="subtle">
              Manual approval
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right">
        {customerBank ? (
          <span className="font-mono text-body font-bold tabular-nums text-success">
            {formatRatePercent(bank.saverApyPercent)}
          </span>
        ) : (
          <span className="text-body-sm text-muted">Not offered</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {customerBank ? (
          <span title={`Personal loans price at the base rate +${CHARACTER_LOAN_SPREAD_PP}pp`}>
            <span className="block font-mono text-body font-bold tabular-nums text-foreground">
              {formatRatePercent(bank.lendingRatePercent)}
            </span>
            <span className="block font-mono text-body-sm tabular-nums text-muted">
              {estRateLabel} {formatRatePercent(estimatedRate)}
            </span>
          </span>
        ) : (
          <span className="text-body-sm text-muted">Not offered</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <BankHealthCell band={bank.warningBand} confidence={bank.confidence} />
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-body tabular-nums text-foreground">
        {formatBankMoney(bank.totalDeposits, bank.currency)}
      </td>
      <td className="sticky right-0 z-10 border-l border-card-border bg-card px-4 py-3.5 transition-colors group-hover:bg-[color-mix(in_srgb,var(--background)_40%,var(--card))]">
        <div className="flex items-center justify-end gap-2">
          {customerBank && hasCharacter ? (
            <>
              <button
                type="button"
                onClick={onDeposit}
                aria-label={`Deposit savings at ${bank.name}`}
                className="rounded-lg border border-success/35 bg-success/10 px-3 py-1.5 text-body-sm font-semibold text-success transition-colors hover:bg-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
              >
                Deposit
              </button>
              <button
                type="button"
                onClick={onBorrow}
                aria-label={`Apply for a loan at ${bank.name}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Borrow
              </button>
            </>
          ) : (
            <Link
              href={bank.href}
              className="rounded-lg border border-card-border px-3 py-1.5 text-body-sm font-semibold text-muted transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              View bank
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

export const BAND_BAR_COLOR = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-error",
} as const;

export function BankHealthCell({
  band,
  confidence,
}: {
  band: HubPrivateBank["warningBand"];
  confidence: number | null;
}) {
  const score =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.round(confidence * 100)
      : null;
  return (
    <div className="flex items-center justify-end gap-2.5">
      {score != null && (
        <span
          className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-card-border/50 sm:block"
          aria-hidden
        >
          <span
            className={`block h-full rounded-full ${band ? BAND_BAR_COLOR[band] : "bg-muted"}`}
            style={{ width: `${score}%` }}
          />
        </span>
      )}
      <span className="w-7 text-right font-mono text-body font-bold tabular-nums text-foreground">
        {score ?? "â€”"}
      </span>
      <WarningBandBadge band={band} />
    </div>
  );
}

export function YourSavingsSection({
  rows,
  onChanged,
  showToast,
}: {
  rows: HubSavingsRow[];
  onChanged: () => Promise<void>;
  showToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const savingsRequest = useSavingsRequest();
  const [withdrawAmounts, setWithdrawAmounts] = useState<Partial<Record<CurrencyCode, string>>>({});

  const setHolder = async (currency: CurrencyCode, holder: string) => {
    setBusy(currency);
    try {
      const res = await fetch("/api/character/savings-holder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, holder }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(apiErrorText(json, "Could not move savings"), "error");
        return;
      }
      showToast("Savings holder updated", "success");
      await onChanged();
    } catch {
      showToast("Could not move savings. Check your connection and try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (currency: CurrencyCode, balance: number) => {
    const amount = Number(withdrawAmounts[currency]);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      showToast("Enter a withdrawal amount up to your savings balance", "error");
      return;
    }

    setBusy(`withdraw:${currency}`);
    try {
      const { response: res, json } = await savingsRequest("/api/character/savings/withdraw", {
        currency,
        amount,
      });
      if (!res.ok) {
        showToast(apiErrorText(json, "Withdrawal failed"), "error");
        return;
      }
      showToast(`Withdrew ${formatBankMoney(amount, currency)} from savings`, "success");
      setWithdrawAmounts((current) => ({ ...current, [currency]: "" }));
      await onChanged();
    } catch {
      showToast("Withdrawal failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-card">
        <AccountCardHeader
          icon={PiggyBank}
          title="Savings"
          description="Choose where each currency balance is held."
        />
        <EmptyState
          title="No savings accounts yet"
          description="Open a savings account at a central bank Savings tab, then choose where it is held here."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-card">
      <AccountCardHeader
        icon={PiggyBank}
        title="Savings"
        description="Choose where savings earn interest, or withdraw them to your wallet."
      />
      <div className="divide-y divide-card-border">
        {rows.map((row) => (
          <div
            key={row.currency}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_minmax(280px,1.1fr)] sm:items-center"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 shrink-0 font-mono text-body-sm font-bold text-foreground">
                {row.currency}
              </span>
              <div>
                <p className="text-body-sm font-medium text-muted">Balance</p>
                <p className="mt-0.5 font-mono text-body font-bold tabular-nums text-foreground">
                  {formatBankMoney(row.balance, row.currency)}
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <label className="flex min-w-0 flex-col gap-1 text-body-sm font-medium text-muted">
                Held at
                <select
                  className="h-10 w-full rounded-lg border border-card-border bg-background px-3 text-body font-normal normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  value={row.currentHolder}
                  disabled={busy !== null}
                  onChange={(e) => void setHolder(row.currency, e.target.value)}
                  aria-label={`Savings holder for ${row.currency}`}
                >
                  {row.options.map((opt) => (
                    <option key={opt.holder} value={opt.holder}>
                      {opt.label} Â· {formatRatePercent(opt.depositRatePercent)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={row.balance}
                  step="any"
                  value={withdrawAmounts[row.currency] ?? ""}
                  onChange={(event) =>
                    setWithdrawAmounts((current) => ({
                      ...current,
                      [row.currency]: event.target.value,
                    }))
                  }
                  disabled={busy !== null}
                  placeholder={`Amount in ${row.currency}`}
                  aria-label={`Withdrawal amount in ${row.currency}`}
                  className="h-10 min-w-0 rounded-lg border border-card-border bg-background px-3 font-mono text-body tabular-nums text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label={`Withdraw ${row.currency} savings`}
                  disabled={
                    busy !== null ||
                    !Number.isFinite(Number(withdrawAmounts[row.currency])) ||
                    Number(withdrawAmounts[row.currency]) <= 0 ||
                    Number(withdrawAmounts[row.currency]) > row.balance
                  }
                  onClick={() => void withdraw(row.currency, row.balance)}
                  className="h-10 rounded-lg border border-card-border bg-card px-4 text-body font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === `withdraw:${row.currency}` ? "â€¦" : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccountCardHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Landmark;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-card-border bg-card-elevated/45 px-5 py-4">
      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div>
        <h3 className="font-bold text-foreground">{title}</h3>
        <p className="mt-0.5 text-body-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
