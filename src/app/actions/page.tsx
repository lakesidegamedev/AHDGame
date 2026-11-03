"use client";

import dynamic from "next/dynamic";
import { CampaignActionModal } from "./components/CampaignActionModal";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { calculatePoliticalInfluenceDecay } from "@shared/constants/formulas";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { fetchJson } from "@/lib/observability/fetchJson";
import { Skeleton } from "@/components/ui";
import { CARDS } from "./actionsConstants";
import type { ActionsViewMode } from "./actionsTypes";
import ActionCard from "./components/ActionCard";
import ActionCardCompact from "./components/ActionCardCompact";
import ActionsHero from "./components/ActionsHero";
import { EventsPanel } from "./components/EventsPanel";
import { useActionsController } from "./useActionsController";
import { actionCardProps } from "./actionCardProps";
import { getActionImage } from "@/lib/images/actionImages";

// Conditional banners: each renders nothing unless the player has a pending
// event, a live debate, an active crisis or an unendorsed home presidential
// race. The first three render as items inside `EventsPanel`. They are code-split so the action grid's first load does not carry
// them or the metric catalogue behind the crisis card. Each still
// server-renders when it has something to show, so nothing reserves space and
// then moves.
const NullFallback = () => null;
const PlayerEventCard = dynamic(() => import("./components/PlayerEventCard"), {
  loading: NullFallback,
});
const DebateCard = dynamic(() => import("./components/DebateCard"), { loading: NullFallback });
const CrisisActionCard = dynamic(() => import("./components/CrisisActionCard"), {
  loading: NullFallback,
});
const EndorsePresidentCard = dynamic(() => import("./components/EndorsePresidentCard"), {
  loading: NullFallback,
});
import CategoryFilter from "./components/CategoryFilter";
import ViewToggle from "./components/ViewToggle";
import CategoryHeading from "./components/CategoryHeading";

const CATEGORIES = ["all", "influence", "money", "research"];

export default function ActionsPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [portfolioData, setPortfolioData] = useState<{
    totalValue: number;
    totalBondValue: number;
    totalBondIncomePerTurn: number;
    cashOnHand: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ActionsViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("actionsViewMode") as ActionsViewMode) || "cards";
    }
    return "cards";
  });

  // The account's saved preference wins over this browser's.
  const adoptStoredViewMode = useCallback((mode: ActionsViewMode) => {
    setViewMode(mode);
    localStorage.setItem("actionsViewMode", mode);
  }, []);
  const controller = useActionsController({ viewMode, onStoredViewMode: adoptStoredViewMode });
  const { character, actionCosts, era, countryId, eraLabel } = controller;

  const handleViewModeChange = useCallback((mode: ActionsViewMode) => {
    setViewMode(mode);
    localStorage.setItem("actionsViewMode", mode);
    fetchJson("/api/settings/actions-view-mode", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionsViewMode: mode }),
      feature: "actions-view-mode",
    }).catch(() => {});
  }, []);

  // Fetch portfolio data on mount
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        // Four scalar totals are all this page renders; `summary=1` skips the
        // 500-row history chart (and its per-row FX snapshots).
        const res = await fetch("/api/character/portfolio?summary=1");
        if (res.ok) {
          const data = await res.json();
          setPortfolioData({
            totalValue: data.totalValue ?? 0,
            totalBondValue: data.totalBondValue ?? 0,
            totalBondIncomePerTurn: data.totalBondIncomePerTurn ?? 0,
            cashOnHand: data.liquidCashWealth ?? data.cashOnHand ?? 0,
          });
        }
      } catch {
        // Silent fail - portfolio data is optional
      }
    };
    fetchPortfolio();
  }, []);

  const visible = useMemo(
    () =>
      activeCategory === "all"
        ? controller.cards
        : controller.cards.filter((c) => c.category === activeCategory),
    [activeCategory, controller.cards]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: CARDS.length };
    for (const c of CARDS) counts[c.category] = (counts[c.category] ?? 0) + 1;
    return counts;
  }, []);

  const heroImage = useMemo(() => getActionImage("hero", { era, countryId }), [era, countryId]);
  const debateImage = useMemo(
    () => getActionImage("debatePrep", { era, countryId }),
    [era, countryId]
  );

  const influence = character?.politicalInfluence ?? 0;
  const infamy = character?.infamy ?? 0;
  const influenceDecay = calculatePoliticalInfluenceDecay(influence).toFixed(2);

  // Wait on world flags too: resolving art before the era is known would paint
  // the 2019 fallback set for a frame and then swap it for the 1953 set.
  if (!controller.ready || !character || !actionCosts) {
    return (
      <div className="min-h-screen bg-background pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
          {/* Hero skeleton: image area and figures */}
          <div className="relative overflow-hidden rounded-xl border border-card-border bg-card">
            <Skeleton className="h-[175px] sm:h-[220px] w-full rounded-none" />
            <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-card-border px-5 py-4 sm:px-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="min-w-[80px] space-y-1.5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
              <div className="flex-1 min-w-[160px] space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-2.5 w-10" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Filter tabs + view toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>

          {/* First category heading and its cards */}
          <div className="space-y-2 border-b border-card-border pb-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-card-border bg-card overflow-hidden">
                <Skeleton className="h-40 w-full rounded-none" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-24 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const CardComponent = viewMode === "cards" ? ActionCard : ActionCardCompact;
  const listClass =
    viewMode === "cards"
      ? "mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      : "mt-4 divide-y divide-card-border overflow-hidden rounded-xl border border-card-border bg-card";
  const donorSummary = {
    level: character.donorBaseLevel ?? 0,
    fundraiseYield: actionCosts.fundraiseAmount,
    currency: getHomeCurrency(character),
    upgradeCost: actionCosts.donorUpgradeCost,
  };
  const renderCard = (card: (typeof controller.cards)[number], index: number) => (
    <CardComponent key={card.type} {...actionCardProps(controller, card, index, viewMode)} />
  );

  return (
    <div className="min-h-screen bg-background pb-12">
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 overflow-x-hidden">
        {/* Hero Section */}
        <ActionsHero
          character={character}
          imageUrl={heroImage}
          eraLabel={eraLabel}
          campaignFundsDisplay={controller.displayCampaignFundsStored}
          campaignFundsCurrency={getHomeCurrency(character)}
          influence={influence}
          infamy={infamy}
          influenceDecay={influenceDecay}
          portfolioData={portfolioData}
        />

        {/* Random events, debates and crises share one panel. It hides itself
            until one of them has something to show. */}
        <EventsPanel>
          <PlayerEventCard />
          <DebateCard imageUrl={debateImage} />
          <CrisisActionCard />
        </EventsPanel>

        {/* Presidential endorsement nudge: renders nothing when the player has
            no live presidential race at home or has already endorsed someone */}
        <EndorsePresidentCard />

        {/* Filter Tabs + View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <CategoryFilter
            categories={CATEGORIES}
            counts={categoryCounts}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
          <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
        </div>

        {/* Action cards: grouped under category headings on "All operations" */}
        {activeCategory === "all" ? (
          <div className="space-y-12">
            {CATEGORIES.filter((c) => c !== "all").map((category) => {
              const cards = controller.cards.filter((c) => c.category === category);
              return (
                <section key={category} aria-labelledby={`actions-${category}-title`}>
                  <CategoryHeading
                    category={category}
                    count={cards.length}
                    donor={category === "money" ? donorSummary : null}
                  />
                  <div className={listClass}>{cards.map(renderCard)}</div>
                </section>
              );
            })}
          </div>
        ) : (
          <section aria-labelledby={`actions-${activeCategory}-title`}>
            <CategoryHeading
              category={activeCategory}
              count={visible.length}
              donor={activeCategory === "money" ? donorSummary : null}
            />
            <div className={listClass}>{visible.map(renderCard)}</div>
          </section>
        )}
      </main>
      <CampaignActionModal
        action={controller.campaignAction}
        character={character}
        onClose={() => controller.setCampaignAction(null)}
        onResourcesSpent={controller.fetchCharacter}
      />
    </div>
  );
}
