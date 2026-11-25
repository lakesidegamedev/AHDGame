"use client";

import type { Character } from "@/lib/db/types";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import { HeroImage } from "@/components/HeroImage";
import { calculateFavorabilityAboveThresholdPenalty } from "@shared/constants/formulas";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatPercent } from "@/lib/ui/numbers";
import { toneText } from "@/lib/ui/tone";

interface ActionsHeroProps {
  character: Character;
  /** Hero art already resolved for the live era + the player's country. */
  imageUrl: string;
  /** The live in-game year, e.g. "1953", set after the title. Omit to hide it. */
  eraLabel?: string | null;
  /** Stored campaign war chest in the character's home/local currency. */
  campaignFundsDisplay: number;
  campaignFundsCurrency: CurrencyCode;
  influence: number;
  infamy: number;
  influenceDecay: string;
}

interface PortfolioSummary {
  totalValue: number;
  totalBondValue: number;
  totalBondIncomePerTurn: number;
  cashOnHand: number;
}

const LABEL_CLASS = "text-body-sm text-muted";
const VALUE_CLASS = "text-heading font-semibold tabular-nums text-foreground";
const HERO_CARD = "overflow-hidden rounded-xl border border-card-border bg-card";
const HERO_STATS =
  "grid gap-x-12 gap-y-5 border-t border-card-border px-5 py-4 sm:px-8 lg:grid-cols-[auto_minmax(16rem,1fr)] lg:items-start";
const FIGURES = "grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10";
const METER_ROW = "min-h-[3.25rem]";

/** A 0 to 100 meter in the stat's own color (influence red, favorability amber). */
function Meter({ value, fillClass }: { value: number; fillClass: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-card-border" aria-hidden>
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${fillClass}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function ActionsHeroBanner({
  imageUrl,
  eraLabel,
}: Pick<ActionsHeroProps, "imageUrl" | "eraLabel">) {
  return (
    <div className="relative h-[175px] w-full sm:h-[220px]">
      <HeroImage
        key={imageUrl}
        src={imageUrl}
        alt="Political campaign"
        fill
        className="object-cover object-[center_55%]"
        sizes="(width < 640px) calc(100vw - 2rem), (width < 1280px) calc(100vw - 3rem), 1232px"
        priority
        fetchPriority="high"
        optimize
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
        aria-hidden
      />
      <div className="absolute inset-0 flex flex-col justify-end px-5 pb-5 sm:px-8 sm:pb-7">
        <h1 className="text-display font-bold leading-tight tracking-tight text-white sm:text-display">
          Campaign operations
          {eraLabel && (
            <span className="ml-3 font-normal tabular-nums text-white/70">{eraLabel}</span>
          )}
        </h1>
        <p className="mt-1.5 max-w-2xl text-body text-white/85 sm:text-body-lg">
          Spend actions and campaign money on influence, favorability, fundraising and polls.
        </p>
      </div>
    </div>
  );
}

export function ActionsHeroLoading({
  hero,
}: {
  hero: Pick<ActionsHeroProps, "imageUrl" | "eraLabel"> | null;
}) {
  return (
    <header className={HERO_CARD} aria-busy="true">
      {hero ? (
        <ActionsHeroBanner {...hero} />
      ) : (
        <Skeleton className="h-[175px] sm:h-[220px] w-full rounded-none" />
      )}
      <div className={HERO_STATS} aria-hidden>
        <div className={FIGURES}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="min-w-0 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {["influence", "favorability"].map((meter) => (
            <div key={meter} className={METER_ROW}>
              <div className="mb-1.5 flex h-5 items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

export default function ActionsHero({
  character,
  imageUrl,
  eraLabel,
  campaignFundsDisplay,
  campaignFundsCurrency,
  influence,
  infamy,
  influenceDecay,
}: ActionsHeroProps) {
  const { formatAmount } = useCurrency();
  const [fundsExpanded, setFundsExpanded] = useState(false);
  const [portfolio, setPortfolio] = useState<{ character: string; data: PortfolioSummary } | null>(
    null
  );
  const [portfolioFailed, setPortfolioFailed] = useState(false);
  const characterId = String(character._id);
  const portfolioData = portfolio?.character === characterId ? portfolio.data : null;
  const favorability = character.favorability ?? 50;
  const favAboveThresholdPenalty = calculateFavorabilityAboveThresholdPenalty(favorability);
  const favDecayDisplay = favAboveThresholdPenalty > 0 ? favAboveThresholdPenalty.toFixed(1) : null;

  useEffect(() => {
    if (!fundsExpanded || portfolioData) return;
    const controller = new AbortController();
    void fetch("/api/character/portfolio?summary=1", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Portfolio unavailable");
        const data = await response.json();
        if (controller.signal.aborted) return;
        setPortfolio({
          character: characterId,
          data: {
            totalValue: data.totalValue ?? 0,
            totalBondValue: data.totalBondValue ?? 0,
            totalBondIncomePerTurn: data.totalBondIncomePerTurn ?? 0,
            cashOnHand: data.liquidCashWealth ?? data.cashOnHand ?? 0,
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPortfolioFailed(true);
      });
    return () => controller.abort();
  }, [characterId, fundsExpanded, portfolioData]);

  return (
    <header className={HERO_CARD}>
      <ActionsHeroBanner imageUrl={imageUrl} eraLabel={eraLabel} />

      <div className={HERO_STATS}>
        <dl className={FIGURES}>
          <div>
            <dt className={LABEL_CLASS}>Actions</dt>
            <dd>
              <span className={VALUE_CLASS}>{character.actions}</span>
              <span className="ml-1 text-body-sm text-muted">remaining</span>
            </dd>
          </div>

          <div>
            <dt>
              <button
                type="button"
                className="flex items-center gap-1 rounded text-body-sm text-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => {
                  setPortfolioFailed(false);
                  setFundsExpanded(!fundsExpanded);
                }}
                aria-expanded={fundsExpanded}
                aria-label={fundsExpanded ? "Hide funds breakdown" : "Show funds breakdown"}
              >
                Campaign funds
                <svg
                  className={`h-3 w-3 transition-transform ${fundsExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </dt>
            <dd className={VALUE_CLASS}>
              {formatCurrencyFaceAmount(campaignFundsDisplay, campaignFundsCurrency)}
            </dd>
            {fundsExpanded && !portfolioData && (
              <dd role="status" className="mt-2 text-body-sm text-muted">
                {portfolioFailed
                  ? "Portfolio details are unavailable."
                  : "Loading portfolio details"}
              </dd>
            )}
            {fundsExpanded && portfolioData && (
              <dd className="mt-2 space-y-1 text-body-sm">
                <div className="flex justify-between gap-4">
                  <span
                    className="text-muted"
                    title="Your own money across every currency you hold. Campaign funds are separate; Convert cash moves money from your home-currency cash into them."
                  >
                    Personal cash, all currencies
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatAmount(portfolioData.cashOnHand)}
                  </span>
                </div>
                {portfolioData.totalBondValue > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted">Bond income</span>
                    <span className="tabular-nums text-success">
                      +{formatAmount(portfolioData.totalBondIncomePerTurn)} per turn
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-muted">Portfolio</span>
                  <span className="tabular-nums text-foreground">
                    {formatAmount(portfolioData.totalValue + portfolioData.totalBondValue)}
                  </span>
                </div>
                <Link
                  href="/portfolio"
                  className="mt-1 block font-medium text-foreground underline decoration-card-border underline-offset-4 hover:decoration-foreground"
                >
                  View portfolio →
                </Link>
              </dd>
            )}
          </div>

          <div>
            <dt className={LABEL_CLASS}>Infamy</dt>
            <dd
              className={`text-heading font-semibold tabular-nums ${toneText(infamy > 20 ? "warning" : "neutral")}`}
            >
              {formatPercent(infamy)}
            </dd>
          </div>

          <div>
            <dt className={LABEL_CLASS}>Donor level</dt>
            <dd className={VALUE_CLASS}>{character.donorBaseLevel ?? 0}</dd>
          </div>
        </dl>

        <div className="space-y-4">
          <div className={METER_ROW}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={LABEL_CLASS}>Influence</span>
              <span className="text-body font-semibold tabular-nums text-foreground">
                {formatPercent(influence)}
              </span>
            </div>
            <Meter value={influence} fillClass="bg-secondary" />
            <div className="mt-1 text-right text-body-sm text-muted">
              Decay: -{influenceDecay}% per turn
            </div>
          </div>
          <div className={METER_ROW}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={LABEL_CLASS}>Favorability</span>
              <span className="text-body font-semibold tabular-nums text-foreground">
                {formatPercent(favorability)}
              </span>
            </div>
            <Meter value={favorability} fillClass="bg-warning" />
            {favDecayDisplay && (
              <div className="mt-1 text-right text-body-sm text-muted">
                Decay: -{favDecayDisplay}% per turn
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
