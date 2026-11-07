import Link from "next/link";
import { CountryFlag } from "@/components/CountryFlag";
import { ParliamentChart, type PartySeatsDisplay } from "@/components/ChamberChart";
import { RateChart } from "@/components/forex/RateChart";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { computeStrengthVsReferencePercent } from "@/lib/forex/rateSemantics";
import {
  formatFundsCompact,
  formatLocalAmount,
  formatPopulation,
  rawTurnToLarpDate,
} from "@/lib/utils/formattersCore";
import type { CalendarClock } from "@/lib/utils/gameDate";
import {
  backgroundCountryLinks,
  type BackgroundCountryView,
} from "@/lib/country/background/rules/backgroundCountryView";

interface Props {
  view: BackgroundCountryView;
  name: string;
  startingYear: number;
  clock: CalendarClock;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-max flex-col">
      <span className="text-body-sm text-muted">{label}</span>
      <span className="mt-1 text-body-lg font-semibold text-foreground">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-xl border border-card-border bg-card px-5 py-4 sm:px-6"
    >
      <h2 className="text-heading font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const percent = (value: number | null, digits = 1): string =>
  value == null ? "n/a" : `${value.toFixed(digits)}%`;

/**
 * The page a background country (#5702) shows instead of the full country
 * overview. Server rendered from one loaded view; it links only to pages that
 * exist for every country (the currency market, bonds, funds, organisations and
 * crises), never to a region map, legislature or party page.
 */
export function BackgroundCountryOverview({ view, name, startingYear, clock }: Props) {
  const { economy, currency, trade, politics } = view;
  const code = currency?.currencyCode as CurrencyCode | undefined;
  const seats: PartySeatsDisplay[] =
    politics?.parties.map((p) => ({
      party: p.party,
      partyName: p.partyName,
      partyColor: p.partyColor,
      economicPosition: p.economicPosition,
      seats: p.seats,
    })) ?? [];

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto min-w-0 max-w-7xl space-y-6 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <header className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="px-5 pt-5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <CountryFlag country={view.countryId as CountryId} width={48} height={32} />
              <h1 className="min-w-0 break-words text-display font-bold tracking-tight text-foreground sm:text-[2.25rem] sm:leading-tight">
                {name}
              </h1>
            </div>
            <p className="mt-1 text-body text-muted">
              Background nation. Its economy trades with the world, it holds national elections and
              issues bonds, but it has no regions, legislature or politicians to play.
            </p>
          </div>
          <div
            data-testid="background-economy"
            className="mt-5 flex gap-x-10 gap-y-4 overflow-x-auto border-t border-card-border px-5 py-4 sm:flex-wrap sm:overflow-visible sm:px-6"
          >
            <Stat
              label="GDP"
              value={economy.gdp != null && code ? formatLocalAmount(economy.gdp, code) : "n/a"}
            />
            <Stat label="Growth" value={percent(economy.growth)} />
            <Stat label="Inflation" value={percent(economy.inflation)} />
            <Stat label="Unemployment" value={percent(economy.unemployment)} />
            <Stat label="Debt to GDP" value={percent(economy.debtToGdp, 0)} />
            <Stat label="Credit rating" value={economy.creditRating ?? "n/a"} />
            {economy.population != null && (
              <Stat label="Population" value={formatPopulation(economy.population)} />
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Government" testId="background-government">
            {politics ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                  <Stat label="Head of government" value={politics.headName ?? "Vacant"} />
                  {politics.governmentPartyNames.length > 0 && (
                    <Stat label="Governing" value={politics.governmentPartyNames.join(", ")} />
                  )}
                  <Stat label="Approval" value={percent(politics.approval, 0)} />
                  <Stat
                    label="Next election"
                    value={
                      politics.nextElectionTurn != null
                        ? rawTurnToLarpDate(politics.nextElectionTurn, startingYear, clock)
                        : "n/a"
                    }
                  />
                </div>
                {politics.lastElection && (
                  <p className="text-body-sm text-muted">
                    Last election {politics.lastElection.year}
                    {politics.lastElection.snap ? " (snap)" : ""}:{" "}
                    {politics.lastElection.governmentChanged
                      ? "the government changed."
                      : "the government held on."}
                  </p>
                )}
                {politics.totalSeats > 0 && (
                  <ParliamentChart seats={seats} total={politics.totalSeats} />
                )}
                <ul className="space-y-1 text-body-sm">
                  {politics.parties.map((p) => (
                    <li key={p.party} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-foreground">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: p.partyColor }}
                        />
                        {p.partyName}
                        {p.inGovernment ? " (government)" : ""}
                      </span>
                      <span className="text-muted">
                        {p.seats} seats, {(p.voteShare * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-body text-muted">
                The national government has not been formed yet. It appears here after the first
                national election.
              </p>
            )}
          </Section>

          <Section title="Trade with the United States" testId="background-trade">
            {trade ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                  <Stat label="Exports to the US" value={formatFundsCompact(trade.exports, "₳")} />
                  <Stat
                    label="Imports from the US"
                    value={formatFundsCompact(trade.imports, "₳")}
                  />
                  <Stat label="US tariff on its goods" value={percent(trade.partnerTariff)} />
                  <Stat label="Its tariff on US goods" value={percent(trade.ownTariff)} />
                </div>
                <p className="text-body-sm text-muted">
                  Latest cleared market turn.{" "}
                  <Link
                    className="underline underline-offset-4"
                    href={backgroundCountryLinks.trade()}
                  >
                    World trade
                  </Link>
                </p>
              </div>
            ) : (
              <p className="text-body text-muted">No trade recorded yet.</p>
            )}
          </Section>

          <Section title="Currency" testId="background-currency">
            {currency && code ? (
              <div className="space-y-3">
                <RateChart
                  rates={[
                    {
                      countryId: view.countryId as CountryId,
                      currencyCode: code,
                      rate: currency.rate,
                      baseRate: currency.baseRate,
                      rateHistory: currency.rateHistory,
                      strengthVsBase: computeStrengthVsReferencePercent(
                        currency.rate,
                        currency.baseRate
                      ),
                    },
                  ]}
                />
                <Link
                  className="text-body-sm underline underline-offset-4"
                  href={backgroundCountryLinks.forex(view.countryId)}
                >
                  Trade {code}
                </Link>
              </div>
            ) : (
              <p className="text-body text-muted">No exchange rate yet.</p>
            )}
          </Section>

          <Section title="Invest" testId="background-invest">
            <div className="space-y-3">
              {view.bonds.length > 0 ? (
                <ul className="space-y-1 text-body-sm">
                  {view.bonds.map((bond) => (
                    <li key={bond.id} className="flex items-center justify-between gap-3">
                      <Link
                        className="underline underline-offset-4"
                        href={backgroundCountryLinks.bond(bond.id)}
                      >
                        {bond.couponRate.toFixed(2)}% bond, matures{" "}
                        {rawTurnToLarpDate(bond.maturityTurn, startingYear, clock)}
                      </Link>
                      <span className="text-muted">{(bond.marketPrice * 100).toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-muted">No government bonds on offer right now.</p>
              )}
              {view.nationalIndex ? (
                <p className="text-body-sm">
                  <Link
                    className="underline underline-offset-4"
                    href={backgroundCountryLinks.fund(
                      view.nationalIndex.countryId,
                      view.nationalIndex.slug
                    )}
                  >
                    {view.nationalIndex.name}
                  </Link>
                  {view.nationalIndex.level != null && (
                    <span className="text-muted">
                      {" "}
                      index level {(view.nationalIndex.level * 100).toFixed(1)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-body text-muted">No national index fund yet.</p>
              )}
              <Link
                className="text-body-sm underline underline-offset-4"
                href={backgroundCountryLinks.bonds()}
              >
                Bond market
              </Link>
            </div>
          </Section>

          <Section title="Alliances and organisations" testId="background-alliances">
            {view.alliances.length > 0 ? (
              <ul className="flex flex-wrap gap-2 text-body-sm">
                {view.alliances.map((org) => (
                  <li key={org.id}>
                    <Link
                      title={org.name}
                      className="rounded-md border border-card-border px-2 py-1 text-foreground hover:bg-background"
                      href={backgroundCountryLinks.organization(org.id)}
                    >
                      {org.shortName}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">Not a member of any organisation.</p>
            )}
          </Section>

          <Section title="Active crises" testId="background-crises">
            {view.crises.length > 0 ? (
              <ul className="space-y-1 text-body-sm">
                {view.crises.map((crisis) => (
                  <li key={crisis.id}>
                    <Link
                      className="underline underline-offset-4"
                      href={backgroundCountryLinks.crisis(crisis.id)}
                    >
                      {crisis.name}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      since {rawTurnToLarpDate(crisis.startTurn, startingYear, clock)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">No active crises.</p>
            )}
          </Section>
        </div>
      </main>
    </div>
  );
}
