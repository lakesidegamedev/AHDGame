"use client";
import type {
  HubCentralBank,
  HubPrivateBank,
  HubSavingsRow,
  HubTab,
} from "@/app/banking/BankingHubSections";
import {
  BankingHero,
  PrivateBankRow,
  YourSavingsSection,
  AccountCardHeader,
} from "@/app/banking/BankingHubSections";

import { apiErrorText } from "@/lib/errors/catalog";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  HandCoins,
  Landmark,
  WalletCards,
} from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";
import { Badge, Button, EmptyState, Input, Skeleton } from "@/components/ui";
import { useToast } from "@/contexts/ToastContext";

import { formatBankMoney, formatRatePercent } from "@/components/banking/formatBankMoney";
import { PrivateLoanModal } from "@/app/banking/PrivateLoanModal";
import { PrivateDepositModal } from "@/app/banking/PrivateDepositModal";

import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countriesCore";

type HubCeoCorporation = {
  id: string;
  name: string;
  liquidCapital: number;
  incomePerTurn: number;
  currency: CurrencyCode;
};

type HubLoan = {
  id: string;
  bankCorporationId: string;
  bankName: string;
  bankSequentialId: number | null;
  currency: CurrencyCode;
  borrowerType: "character" | "corporation";
  borrowerId: string | null;
  borrowerName: string;
  creditedTo: "personalCash" | "corporationLiquidCapital";
  principal: number;
  outstanding: number;
  ratePercent: number;
  originatedTurn: number;
  termTurns: number;
  status: string;
};

type HubPayload = {
  privateBankingEnabled: boolean;
  isAdmin: boolean;
  characterId: string | null;
  primaryCountryId: CountryId;
  primaryCurrency: CurrencyCode;
  centralBanks: HubCentralBank[];
  privateBanks: HubPrivateBank[];
  savings: HubSavingsRow[];
  savingsBalances?: Partial<Record<CurrencyCode, number>>;
  personalCash: Partial<Record<CurrencyCode, number>>;
  exchangeRates?: Partial<Record<CurrencyCode, number>>;
  displayFxRates?: Partial<Record<CurrencyCode, number>>;
  personalIncomeByCurrency: Partial<Record<CurrencyCode, number>>;
  currentTurn: number;
  ceoCorporations: HubCeoCorporation[];
  loans: HubLoan[];
  lendingBanks: HubPrivateBank[];
};

export function BankingHubClient() {
  const { showToast } = useToast();
  const [data, setData] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositBank, setDepositBank] = useState<HubPrivateBank | null>(null);
  const [loanBankId, setLoanBankId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HubTab>("private");

  const load = useCallback(async () => {
    return fetch("/api/banking/hub")
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as HubPayload & { error?: string };
        if (!res.ok) {
          setError(apiErrorText(json, "Failed to load banking hub"));
          setData(null);
          return;
        }
        setError(null);
        setData(json);
      })
      .catch(async () => {
        setError("Failed to load banking hub");
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <EmptyState title="Banking unavailable" description={error ?? "Could not load."} />
      </div>
    );
  }

  const primary = data.centralBanks.find((b) => b.isPrimary);
  const resolvedTab: HubTab = data.privateBankingEnabled ? activeTab : "central";
  const visibleTabs: Array<{ id: HubTab; label: string; icon: typeof Landmark; count?: number }> = [
    ...(data.privateBankingEnabled
      ? [
          {
            id: "private" as const,
            label: "Private banks",
            icon: Building2,
            count: data.privateBanks.length,
          },
        ]
      : []),
    { id: "central", label: "Central banks", icon: Landmark, count: data.centralBanks.length },
    ...(data.privateBankingEnabled
      ? [{ id: "accounts" as const, label: "Your accounts", icon: WalletCards }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-16 sm:px-6 sm:py-8">
      <BankingHero
        primary={primary}
        privateBankingEnabled={data.privateBankingEnabled}
        hasCharacter={!!data.characterId}
        primaryCurrency={data.primaryCurrency}
        personalCash={data.personalCash ?? {}}
        savingsBalances={data.savingsBalances ?? {}}
        displayFxRates={data.displayFxRates ?? {}}
        onNavigate={setActiveTab}
      />

      <HubTabs tabs={visibleTabs} activeTab={resolvedTab} onChange={setActiveTab} />

      {resolvedTab === "central" && (
        <section
          id="banking-panel-central"
          role="tabpanel"
          aria-labelledby="banking-tab-central"
          className="space-y-4"
        >
          <SectionHeading
            id="central-banks-heading"
            title="Central banks"
            description="Compare the policy rates that set the baseline for saving and borrowing in each currency."
          />
          <CentralBanksTable banks={data.centralBanks} />
        </section>
      )}

      {data.privateBankingEnabled && resolvedTab === "private" && (
        <section
          id="banking-panel-private"
          role="tabpanel"
          aria-labelledby="banking-tab-private"
          className="space-y-4"
        >
          <SectionHeading
            id="private-banks-heading"
            title="Private banks"
            description="Chartered institutions compete on rates while reserve rules and deposit insurance shape their risk."
            aside={
              <Badge color="default" variant="outline">
                {data.privateBanks.length} chartered
              </Badge>
            }
          />
          {data.privateBanks.length === 0 ? (
            <EmptyState
              title="No chartered banks yet"
              description="A corporation that owns a financial sector can issue a bank charter from its Bank console."
            />
          ) : (
            <PrivateBanksTable
              banks={data.privateBanks}
              hasCharacter={!!data.characterId}
              onDeposit={setDepositBank}
              onBorrow={(bank) => setLoanBankId(bank.corporationId)}
            />
          )}
        </section>
      )}

      {data.privateBankingEnabled && resolvedTab === "accounts" && (
        <section
          id="banking-panel-accounts"
          role="tabpanel"
          aria-labelledby="banking-tab-accounts"
          className="space-y-4"
        >
          <SectionHeading
            id="accounts-heading"
            title="Your accounts"
            description="Place each savings balance where it earns the best return, or arrange new credit."
          />
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <YourSavingsSection rows={data.savings} onChanged={load} showToast={showToast} />
            <GetLoanForm
              banks={data.lendingBanks}
              ceoCorporations={data.ceoCorporations}
              personalCash={data.personalCash ?? {}}
              exchangeRates={data.exchangeRates ?? {}}
              personalIncomeByCurrency={data.personalIncomeByCurrency ?? {}}
              currentTurn={data.currentTurn ?? 1}
              loans={data.loans ?? []}
              hasCharacter={!!data.characterId}
              onChanged={load}
              showToast={showToast}
            />
          </div>
          <YourLoansSection loans={data.loans ?? []} />
        </section>
      )}

      {data.isAdmin && (
        <AdminUnwindPanel banks={data.privateBanks} onChanged={load} showToast={showToast} />
      )}

      {depositBank && data.characterId && (
        <PrivateDepositModal
          bank={depositBank}
          availableCash={data.personalCash?.[depositBank.currency] ?? 0}
          onClose={() => setDepositBank(null)}
          onChanged={load}
          showToast={showToast}
        />
      )}
      {loanBankId && data.characterId && (
        <PrivateLoanModal
          banks={data.lendingBanks}
          ceoCorporations={data.ceoCorporations}
          personalCash={data.personalCash ?? {}}
          exchangeRates={data.exchangeRates ?? {}}
          personalIncomeByCurrency={data.personalIncomeByCurrency ?? {}}
          currentTurn={data.currentTurn ?? 1}
          loans={data.loans ?? []}
          hasCharacter
          initialBankId={loanBankId}
          onClose={() => setLoanBankId(null)}
          onChanged={load}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function HubTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<{ id: HubTab; label: string; icon: typeof Landmark; count?: number }>;
  activeTab: HubTab;
  onChange: (tab: HubTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Banking sections"
      className="flex gap-1 overflow-x-auto rounded-2xl border border-card-border bg-card p-1.5 shadow-card"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            id={`banking-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`banking-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? "bg-primary text-white shadow-sm"
                : "text-muted hover:bg-card-elevated hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  active ? "bg-white/15 text-white" : "bg-card-elevated text-muted"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type SectionHeadingProps = {
  id: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
};

function SectionHeading({ id, title, description, aside }: SectionHeadingProps) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      </div>
      {aside && <div className="hidden shrink-0 sm:block">{aside}</div>}
    </div>
  );
}

// ── Sortable tables ────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";
type SortState<K extends string> = { key: K; dir: SortDirection } | null;

function toggleSort<K extends string>(
  current: SortState<K>,
  column: K,
  defaultDir: SortDirection
): SortState<K> {
  if (current?.key === column) {
    return { key: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: column, dir: defaultDir };
}

function SortableTh<K extends string>({
  label,
  column,
  sort,
  onToggle,
  defaultDir = "desc",
  align = "left",
  className = "",
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onToggle: (column: K, defaultDir: SortDirection) => void;
  defaultDir?: SortDirection;
  align?: "left" | "right";
  className?: string;
}) {
  const dir = sort && sort.key === column ? sort.dir : null;
  return (
    <th
      scope="col"
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
      className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onToggle(column, defaultDir)}
        className={`group inline-flex items-center gap-1 uppercase tracking-widest transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          align === "right" ? "flex-row-reverse" : ""
        } ${dir ? "text-foreground" : ""}`}
      >
        {label}
        {dir ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-primary" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
          )
        ) : (
          <ArrowUpDown
            className="h-3 w-3 text-muted/40 transition-colors group-hover:text-muted"
            aria-hidden
          />
        )}
      </button>
    </th>
  );
}

function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  metric: (row: T, key: K) => number | string | null,
  tiebreak: (row: T) => string
): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const av = metric(a, key);
    const bv = metric(b, key);
    let cmp: number;
    if (av == null && bv == null) cmp = 0;
    else if (av == null) return 1;
    else if (bv == null) return -1;
    else if (typeof av === "string") cmp = av.localeCompare(String(bv));
    else cmp = av - Number(bv);
    const ordered = dir === "asc" ? cmp : -cmp;
    return ordered === 0 ? tiebreak(a).localeCompare(tiebreak(b)) : ordered;
  });
}

// ── Central banks table ────────────────────────────────────────────────

type CentralBankSortKey = "name" | "prime" | "apy";

function CentralBanksTable({ banks }: { banks: HubCentralBank[] }) {
  const [sort, setSort] = useState<SortState<CentralBankSortKey>>(null);

  const sorted = useMemo(
    () =>
      sortRows(
        banks,
        sort,
        (bank, key) => {
          if (key === "name") return bank.bankName.toLowerCase();
          if (key === "prime") return bank.primeRate;
          return bank.savingsApyPercent;
        },
        (bank) => bank.bankName
      ),
    [banks, sort]
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-card-border bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-card-border bg-card-elevated/45 text-sm font-semibold text-foreground">
            <SortableTh
              label="Bank"
              column="name"
              sort={sort}
              onToggle={(key, dir) => setSort((cur) => toggleSort(cur, key, dir))}
              defaultDir="asc"
              className="pl-5"
            />
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Currency
            </th>
            <SortableTh
              label="Prime rate"
              column="prime"
              sort={sort}
              onToggle={(key, dir) => setSort((cur) => toggleSort(cur, key, dir))}
              align="right"
            />
            <SortableTh
              label="Savings APY"
              column="apy"
              sort={sort}
              onToggle={(key, dir) => setSort((cur) => toggleSort(cur, key, dir))}
              align="right"
            />
            <th scope="col" className="px-5 py-3 text-right font-semibold">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {sorted.map((bank) => (
            <tr key={bank.currency} className="transition-colors hover:bg-background/40">
              <td className="px-5 py-3.5">
                <Link
                  href={bank.href}
                  className="group flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-card-border bg-card-elevated">
                    <CountryFlag
                      country={bank.countryId}
                      width={32}
                      height={22}
                      title={bank.countryName}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                      {bank.bankName}
                    </span>
                    <span className="block text-xs text-muted">{bank.countryName}</span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3.5 font-mono text-xs font-semibold text-muted">
                {bank.currency}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-sm font-bold tabular-nums text-foreground">
                {formatRatePercent(bank.primeRate)}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-sm font-bold tabular-nums text-success">
                {formatRatePercent(bank.savingsApyPercent)}
              </td>
              <td className="px-5 py-3.5 text-right">
                {bank.isPrimary ? (
                  <Badge color="primary" variant="subtle">
                    Your bank
                  </Badge>
                ) : (
                  <Link
                    href={bank.href}
                    aria-label={`Open ${bank.bankName}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Open desk
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Private banks table ────────────────────────────────────────────────

type PrivateBankSortKey = "name" | "depositApy" | "loanRate" | "health" | "deposits";

function PrivateBanksTable({
  banks,
  hasCharacter,
  onDeposit,
  onBorrow,
}: {
  banks: HubPrivateBank[];
  hasCharacter: boolean;
  onDeposit: (bank: HubPrivateBank) => void;
  onBorrow: (bank: HubPrivateBank) => void;
}) {
  const [sort, setSort] = useState<SortState<PrivateBankSortKey>>({
    key: "depositApy",
    dir: "desc",
  });
  const estRateLabel = hasCharacter ? "Est. yours" : "Est. personal";

  const sorted = useMemo(
    () =>
      sortRows(
        banks,
        sort,
        (bank, key) => {
          switch (key) {
            case "name":
              return bank.name.toLowerCase();
            case "depositApy":
              return bank.charterType === "investment" ? null : bank.saverApyPercent;
            case "loanRate":
              return bank.charterType === "investment" ? null : bank.lendingRatePercent;
            case "health":
              return bank.confidence;
            case "deposits":
              return bank.totalDeposits;
            default:
              return bank.name.toLowerCase();
          }
        },
        (bank) => bank.name
      ),
    [banks, sort]
  );

  const onToggle = (key: PrivateBankSortKey, dir: SortDirection) =>
    setSort((cur) => toggleSort(cur, key, dir));

  return (
    <div className="overflow-x-auto rounded-2xl border border-card-border bg-card shadow-card">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-card-border bg-card-elevated/45 text-sm font-semibold text-foreground">
            <SortableTh
              label="Bank"
              column="name"
              sort={sort}
              onToggle={onToggle}
              defaultDir="asc"
              className="pl-5"
            />
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Charter
            </th>
            <SortableTh
              label="Savings APY"
              column="depositApy"
              sort={sort}
              onToggle={onToggle}
              align="right"
            />
            <SortableTh
              label="Loan rate"
              column="loanRate"
              sort={sort}
              onToggle={onToggle}
              defaultDir="asc"
              align="right"
            />
            <SortableTh
              label="Health"
              column="health"
              sort={sort}
              onToggle={onToggle}
              align="right"
            />
            <SortableTh
              label="Deposits"
              column="deposits"
              sort={sort}
              onToggle={onToggle}
              align="right"
            />
            <th
              scope="col"
              className="sticky right-0 z-20 border-l border-card-border bg-card-elevated px-4 py-3 text-right font-semibold"
            >
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {sorted.map((bank) => (
            <PrivateBankRow
              key={bank.corporationId}
              bank={bank}
              estRateLabel={estRateLabel}
              hasCharacter={hasCharacter}
              onDeposit={() => onDeposit(bank)}
              onBorrow={() => onBorrow(bank)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GetLoanForm({
  banks,
  ceoCorporations,
  personalCash,
  exchangeRates,
  personalIncomeByCurrency,
  currentTurn,
  loans,
  hasCharacter,
  onChanged,
  showToast,
}: {
  banks: HubPrivateBank[];
  ceoCorporations: HubCeoCorporation[];
  personalCash: Partial<Record<CurrencyCode, number>>;
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  personalIncomeByCurrency: Partial<Record<CurrencyCode, number>>;
  currentTurn: number;
  loans: HubLoan[];
  hasCharacter: boolean;
  onChanged: () => Promise<void>;
  showToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
}) {
  const [open, setOpen] = useState(false);

  if (banks.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-card">
        <AccountCardHeader
          icon={HandCoins}
          title="New credit"
          description="Borrow personally or for a corporation you lead."
        />
        <EmptyState
          title="No lending banks"
          description="Deposit-taking banks (retail or universal) appear here when chartered."
        />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-card">
        <AccountCardHeader
          icon={HandCoins}
          title="New credit"
          description="Borrow personally or for a corporation you lead."
        />
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-card-border bg-background/45 px-4 py-3 text-sm leading-relaxed text-muted">
            <p className="font-semibold text-foreground">Clear terms before you submit</p>
            <p className="mt-1">
              Choose Personal loan or Corporation loan. The review screen shows the lender, quoted
              rate, destination, payment estimate, and maximum before any request is sent.
            </p>
          </div>
          <Button type="button" className="w-full" onClick={() => setOpen(true)}>
            Arrange private-bank loan
          </Button>
        </div>
      </div>
      {open && (
        <PrivateLoanModal
          banks={banks}
          ceoCorporations={ceoCorporations}
          personalCash={personalCash}
          exchangeRates={exchangeRates}
          personalIncomeByCurrency={personalIncomeByCurrency}
          currentTurn={currentTurn}
          loans={loans}
          hasCharacter={hasCharacter}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          showToast={showToast}
        />
      )}
    </>
  );
}
function YourLoansSection({ loans }: { loans: HubLoan[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-card">
      <AccountCardHeader
        icon={HandCoins}
        title="Your loans"
        description="Private-bank credit already drawn. Character loans land in personal cash; corporation loans land in that company's liquid capital."
      />
      {loans.length === 0 ? (
        <EmptyState
          title="No open private-bank loans"
          description="New credit appears here as soon as it is originated, including where the proceeds were credited."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-sm font-semibold text-foreground">
                <th className="px-5 py-3 font-semibold">Bank</th>
                <th className="px-4 py-3 font-semibold">Borrower</th>
                <th className="px-4 py-3 font-semibold">Credited to</th>
                <th className="px-4 py-3 font-semibold text-right">Outstanding</th>
                <th className="px-4 py-3 font-semibold text-right">Rate</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td className="px-5 py-3">
                    <Link
                      href={
                        loan.bankSequentialId != null
                          ? `/corporation/${loan.bankSequentialId}?tab=bank`
                          : `/corporation/${loan.bankCorporationId}?tab=bank`
                      }
                      className="font-medium text-primary hover:opacity-80"
                    >
                      {loan.bankName}
                    </Link>
                    <p className="font-mono text-[11px] text-muted">{loan.currency}</p>
                  </td>
                  <td className="px-4 py-3">
                    {loan.borrowerName}
                    <p className="text-[11px] text-muted">
                      {loan.borrowerType === "character" ? "Personal" : "Corporation"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {loan.creditedTo === "personalCash"
                      ? "Personal cash"
                      : `${loan.borrowerName} liquid capital`}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatBankMoney(loan.outstanding, loan.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatRatePercent(loan.ratePercent)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      color={
                        loan.status === "current"
                          ? "success"
                          : loan.status === "arrears"
                            ? "warning"
                            : loan.status === "defaulted"
                              ? "error"
                              : "default"
                      }
                      variant="subtle"
                    >
                      {loan.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminUnwindPanel({
  banks,
  onChanged,
  showToast,
}: {
  banks: HubPrivateBank[];
  onChanged: () => Promise<void>;
  showToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
}) {
  const [selectedCorpId, setCorpId] = useState("");
  const corpId = selectedCorpId || banks[0]?.corporationId || "";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!corpId || !reason.trim()) {
      showToast("Corporation and reason are required", "error");
      return;
    }
    if (
      !confirm(
        "Force-unwind this bank? Depositors flip to the central bank. This cannot be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/banking/unwind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corporationId: corpId, reason: reason.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(apiErrorText(json, "Unwind failed"), "error");
        return;
      }
      showToast("Bank unwound", "success");
      setReason("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-error/30 bg-error/5 p-5">
      <h2 className="text-lg font-semibold text-error">Admin: unwind bank</h2>
      <p className="text-sm text-muted">
        Operator escape hatch. Works even when private banking is frozen. Admin only.
      </p>
      {banks.length === 0 ? (
        <p className="text-sm text-muted">No active bank charters to unwind.</p>
      ) : (
        <div className="grid gap-3 max-w-xl">
          <label className="block space-y-1 text-xs text-muted">
            Bank corporation
            <select
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm text-foreground"
              value={corpId}
              onChange={(e) => setCorpId(e.target.value)}
              aria-label="Bank to unwind"
            >
              {banks.map((b) => (
                <option key={b.corporationId} value={b.corporationId}>
                  {b.name} ({b.countryName}
                  {b.sequentialId != null ? ` #${b.sequentialId}` : ""})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs text-muted">
            Reason
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-label="Unwind reason"
            />
          </label>
          <Button type="button" variant="destructive" onClick={() => void run()} disabled={busy}>
            {busy ? "Unwinding..." : "Force unwind"}
          </Button>
        </div>
      )}
    </section>
  );
}
