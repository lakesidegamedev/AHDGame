"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { calculatePoliticalInfluenceDecay } from "@shared/constants/formulas";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { useCurrency } from "@/contexts/CurrencyContext";
import { campaignAnchorToLocal } from "@/lib/campaigns/rules/currency";
import { fetchJson } from "@/lib/observability/fetchJson";
import { CARDS } from "./actionsConstants";
import type { ActionsViewMode } from "./actionsTypes";
import ActionCard from "./components/ActionCard";
import ActionCardCompact from "./components/ActionCardCompact";
import ActionsHero, { ActionsHeroLoading } from "./components/ActionsHero";
import { EventsPanel } from "./components/EventsPanel";
import { useActionsController } from "./useActionsController";
import { useGameTurnStatus } from "@/hooks/useGameEvents";
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
const CampaignActionModal = dynamic(() =>
  import("./components/CampaignActionModal").then((module) => module.CampaignActionModal)
);
import CategoryFilter from "./components/CategoryFilter";
import ViewToggle from "./components/ViewToggle";
import CategoryHeading from "./components/CategoryHeading";

const CATEGORIES = ["all", "influence", "money", "research"];
const PAGE_CONTENT = "mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 overflow-x-hidden";
const VIEW_MODE_KEY = "actionsViewMode";

function subscribeToViewMode(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readViewMode(): ActionsViewMode | null {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === "cards" || saved === "compact" ? saved : null;
}

export interface InitialActionsHero {
  imageUrl: string;
  eraLabel: string;
  era: string;
  countryId?: string | null;
  viewMode?: ActionsViewMode;
}

export default function ActionsClient({ initialHero }: { initialHero: InitialActionsHero | null }) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedViewMode, setViewMode] = useState<ActionsViewMode | null>(null);
  const browserViewMode = useSyncExternalStore(subscribeToViewMode, readViewMode, () => null);
  const viewMode = selectedViewMode ?? initialHero?.viewMode ?? browserViewMode ?? "cards";

  // The account's saved preference wins over this browser's.
  const adoptStoredViewMode = useCallback((mode: ActionsViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);
  const controller = useActionsController({ viewMode, onStoredViewMode: adoptStoredViewMode });
  const { baseRates } = useCurrency();
  const { character, actionCosts, era, countryId, eraLabel } = controller;
  const turnProcessing = useGameTurnStatus()?.isProcessing === true;

  const handleViewModeChange = useCallback((mode: ActionsViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
    fetchJson("/api/settings/actions-view-mode", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionsViewMode: mode }),
      feature: "actions-view-mode",
    }).catch(() => {});
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
  const ready = controller.ready && character !== null && actionCosts !== null;
  const controls = (
    <div className="flex items-center justify-between gap-4">
      <CategoryFilter
        categories={CATEGORIES}
        counts={categoryCounts}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />
      <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} disabled={!ready} />
    </div>
  );
  const operationInfo = (
    <p className="text-body-sm text-muted">
      This page lists campaign operations. Post news and Sponsored news are on the{" "}
      <Link href="/news" className="text-primary hover:underline">
        News page
      </Link>
      , and Support, Attack and Barnstorm are on other characters&apos; profiles. Rest does nothing
      and costs nothing, so it has no button.
    </p>
  );

  const CardComponent = viewMode === "cards" ? ActionCard : ActionCardCompact;
  const listClass =
    viewMode === "cards"
      ? "mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      : "mt-4 divide-y divide-card-border overflow-hidden rounded-xl border border-card-border bg-card";
  const donorSummary = ready
    ? {
        level: character.donorBaseLevel ?? 0,
        fundraiseYield: actionCosts.fundraiseAmount,
        currency: getHomeCurrency(character),
        // Same local face value the Build Donor Network card shows.
        upgradeCost: controller.forexEnabled
          ? campaignAnchorToLocal(
              actionCosts.donorUpgradeCost,
              character.countryId ?? "US",
              baseRates
            )
          : actionCosts.donorUpgradeCost,
      }
    : null;
  const renderCard = (card: (typeof controller.cards)[number], index: number) => {
    if (ready) {
      return (
        <CardComponent key={card.type} {...actionCardProps(controller, card, index, viewMode)} />
      );
    }
    const imageUrl =
      viewMode === "cards" && initialHero ? getActionImage(card.imageSlug, initialHero) : null;
    return <CardComponent key={card.type} card={card} imageUrl={imageUrl} loading />;
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <main className={PAGE_CONTENT}>
        {ready ? (
          <ActionsHero
            character={character}
            imageUrl={heroImage}
            eraLabel={eraLabel}
            campaignFundsDisplay={controller.displayCampaignFundsStored}
            campaignFundsCurrency={getHomeCurrency(character)}
            influence={influence}
            infamy={infamy}
            influenceDecay={influenceDecay}
          />
        ) : (
          <ActionsHeroLoading hero={initialHero} />
        )}

        {ready && (
          <>
            <EventsPanel>
              <PlayerEventCard />
              <DebateCard imageUrl={debateImage} />
              <CrisisActionCard />
            </EventsPanel>
            <EndorsePresidentCard />
          </>
        )}

        {/* While a turn processes, actions take seconds to confirm. Without
            this, a click that has not answered yet looks lost and players
            click again, paying twice. */}
        {ready && turnProcessing && (
          <p
            role="status"
            className="sticky top-2 z-10 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-foreground"
          >
            A turn is processing. Actions still work but take a few seconds to confirm. Each click
            spends once it lands, so wait for the result before clicking again.
          </p>
        )}

        {controls}
        {operationInfo}

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
      {ready && controller.campaignAction && (
        <CampaignActionModal
          action={controller.campaignAction}
          character={character}
          onClose={() => controller.setCampaignAction(null)}
          onResourcesSpent={controller.fetchCharacter}
        />
      )}
    </div>
  );
}
