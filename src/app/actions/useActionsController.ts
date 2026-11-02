"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/contexts/ToastContext";
import { useGameEvents } from "@/hooks/useGameEvents";
import { useWorldFlags } from "@/hooks/useWorldFlags";
import type { Character } from "@/lib/db/types";
import {
  getCampaignActionCost,
  getAdvertiseActionCost,
  getDonorActionCost,
  fundraiseYieldLocal,
  isCampaignEligible,
  quoteCampaignAction,
  quoteAdvertiseAction,
  quoteBuildDonorBaseAction,
  type ActionStateEconomics,
} from "@/lib/actions";
import { getHomeCurrency, getTotalPersonalLiquidWealth } from "@/lib/currency/characterFunds";
import { notifyCharacterStatsUpdated } from "@/lib/characterStatsSync";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import { eraIdForYear } from "@/lib/seeds/eraInterpolation";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { getActionImage } from "@/lib/images/actionImages";
import { apiErrorText } from "@/lib/errors/catalog";
import { CARDS } from "./actionsConstants";
import type { ActionCard, ActionProjection, ActionsViewMode } from "./actionsTypes";

/**
 * Everything the Actions cards need to show prices and run: the character, the
 * same cost quotes the server executes, and the execute handlers. Shared by the
 * Actions page and the Campaign Manager's My moves panel so both run exactly
 * the same actions at exactly the same prices.
 */

export type ActionFlash = { type: string; msg: string; ok: boolean } | null;

export interface ActionCosts {
  fundraiseAmount: number;
  donorUpgradeCost: number;
  campaignActionCost: number;
  campaignFundCost: number;
  campaignMaxed: boolean;
  advertiseActionCost: number;
  advertiseFundCost: number;
  fundraiseActionCost: number;
  buildDonorBaseActionCost: number;
  buildDonorBaseFundCost: number;
  campaignInfluenceGain: number | null;
  advertiseFavorabilityGain: number | null;
}

export interface ActionsController {
  character: Character | null;
  homeState: ActionStateEconomics | null;
  /** Character, world flags and quotes are all in: cards can render. */
  ready: boolean;
  era: string;
  eraLabel: string;
  countryId: string | null;
  executing: string | null;
  flash: ActionFlash;
  flipflopStep: "axis" | "direction" | null;
  flipflopAxis: "economic" | "social" | null;
  flipflopDir: -1 | 1 | null;
  setFlipflopStep: (step: "axis" | "direction" | null) => void;
  setFlipflopAxis: (axis: "economic" | "social" | null) => void;
  setFlipflopDir: (dir: -1 | 1 | null) => void;
  convertCashOpen: boolean;
  convertCashAmount: string;
  setConvertCashOpen: (open: boolean) => void;
  setConvertCashAmount: (amount: string) => void;
  campaignAction: "canvass" | "targetedAds" | null;
  setCampaignAction: (action: "canvass" | "targetedAds" | null) => void;
  execute: (type: string, count?: 1 | 5 | 10) => Promise<void>;
  executeFlipflop: (axis: "economic" | "social", direction: -1 | 1) => Promise<void>;
  executeConvertCash: (amount: number) => Promise<void>;
  fetchCharacter: () => Promise<void>;
  actionCosts: ActionCosts | null;
  projections: Partial<Record<string, ActionProjection>>;
  forexEnabled: boolean;
  displayCampaignFundsStored: number;
  displayCampaignFunds: number;
  displayPersonalWealth: number;
  blockGdpScaledCosts: boolean;
  /** The Actions cards, with copy that comes from the message catalog resolved. */
  cards: ActionCard[];
  cardImages: Record<string, string>;
}

export interface ActionsControllerOptions {
  /** Compact view reports results as toasts; card view flashes them on the card. */
  viewMode: ActionsViewMode;
  /** The account's saved view mode, when the auth payload carries one. */
  onStoredViewMode?: (mode: ActionsViewMode) => void;
}

export function useActionsController({
  viewMode,
  onStoredViewMode,
}: ActionsControllerOptions): ActionsController {
  const [campaignAction, setCampaignAction] = useState<"canvass" | "targetedAds" | null>(null);
  const adText = useTranslations("elections.campaignTargeting");
  const { baseRates: campaignRates } = useCurrency();
  const { showToast } = useToast();
  const router = useRouter();
  const worldFlags = useWorldFlags();
  const [character, setCharacter] = useState<Character | null>(null);
  const [homeState, setHomeState] = useState<ActionStateEconomics | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [flash, setFlash] = useState<ActionFlash>(null);
  const [flipflopStep, setFlipflopStep] = useState<"axis" | "direction" | null>(null);
  const [flipflopAxis, setFlipflopAxis] = useState<"economic" | "social" | null>(null);
  const [flipflopDir, setFlipflopDir] = useState<-1 | 1 | null>(null);
  const [convertCashOpen, setConvertCashOpen] = useState(false);
  const [convertCashAmount, setConvertCashAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const storedViewModeRef = useRef(onStoredViewMode);
  useEffect(() => {
    storedViewModeRef.current = onStoredViewMode;
  }, [onStoredViewMode]);

  const fetchCharacter = useCallback(async () => {
    try {
      const [meRes, charRes] = await Promise.all([
        fetch("/api/auth/me"),
        // The GDP and population the cost quotes need ride the character
        // response, so the grid paints at final prices without a second,
        // serial state round trip.
        fetch("/api/auth/character?include=homeState"),
      ]);
      if (meRes.status === 401 || meRes.status === 403) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      // Imperial characters cannot use regular character actions
      if (meData?.user?.isImperial) {
        router.push("/dashboard");
        return;
      }
      // Load user preferences (e.g. actionsViewMode)
      if (meData?.user?.actionsViewMode) {
        storedViewModeRef.current?.(meData.user.actionsViewMode);
      }
      if (charRes.ok) {
        const char: Character & { homeStateEconomics?: ActionStateEconomics | null } =
          await charRes.json();
        setCharacter(char);
        if (char.homeStateEconomics) setHomeState(char.homeStateEconomics);
      }
    } catch (err) {
      console.error("Failed to fetch character:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCharacter();
  }, [fetchCharacter]);

  // Keep the character snapshot — and therefore the affordability gate — in sync
  // with the StatusBar, which refetches on the same triggers. The turn engine
  // credits campaign-fund income server-side, so a page left open across a turn
  // would otherwise gate actions against the stale page-load balance while the
  // StatusBar shows the fresh (higher) figure. That divergence surfaces as a
  // spurious "Insufficient funds" on actions the player can actually afford
  // (bug #0885). Refetch on turn completion and when the player returns to the tab.
  useGameEvents(
    useCallback(() => {
      void fetchCharacter();
    }, [fetchCharacter]),
    ["turn_complete"]
  );
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchCharacter();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchCharacter]);

  const report = (type: string, msg: string, ok: boolean) => {
    if (viewMode === "compact") showToast(msg, ok ? "success" : "error");
    else setFlash({ type, msg, ok });
  };

  const applyCharacter = (next: Character) => {
    setCharacter(next);
    notifyCharacterStatsUpdated({
      ...next,
      // LOCAL home-currency balance (canonical source of truth) — both
      // fields expose the same value during the migration.
      funds: next.currencyBalances?.campaign ?? next.funds ?? 0,
      campaignFundsStored: next.currencyBalances?.campaign ?? next.funds ?? 0,
      personalHomeLiquid: getTotalPersonalLiquidWealth(next, !!next.currencyBalances),
    });
  };

  const execute = async (type: string, count: 1 | 5 | 10 = 1) => {
    if (!character || executing) return;
    const execKey = count === 1 ? type : `${type}:${count}`;
    setExecuting(execKey);
    setFlash(null);
    try {
      const res = await fetch("/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: type,
          ...(count !== 1 ? { count } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        applyCharacter(data.character);
        // The server already formats result messages in the player's local home
        // currency (see makeFundsFormatter), so surface them as-is.
        report(type, data.message, true);
      } else {
        // A refused action can still follow earlier spending (another tab, a
        // turn), so reload the character: stale action points are what let a
        // batch look affordable when it was not (ticket 1457).
        void fetchCharacter();
        report(type, apiErrorText(data, "Action failed."), false);
      }
    } catch {
      report(type, "Network error.", false);
    } finally {
      setExecuting(null);
    }
  };

  const executeFlipflop = async (axis: "economic" | "social", direction: -1 | 1) => {
    if (!character || executing) return;
    setExecuting("flipflop");
    setFlash(null);
    try {
      const res = await fetch("/api/settings/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ axis, direction }),
      });
      const data = await res.json();
      if (res.ok && data.stats) {
        applyCharacter({
          ...character,
          policies: data.stats.policies,
          actions: data.stats.actions,
          infamy: data.stats.infamy,
          politicalInfluence: data.stats.politicalInfluence,
          nationalInfluence: data.stats.nationalInfluence,
        } as Character);
        const axisLabel = axis === "economic" ? "Economic" : "Social";
        const dirLabel = direction === 1 ? "right" : "left";
        report(
          "flipflop",
          `${axisLabel} position shifted ${dirLabel}. +5 Infamy, −5% Influence.`,
          true
        );
      } else {
        report("flipflop", apiErrorText(data, "Shift failed."), false);
      }
    } catch {
      report("flipflop", "Network error.", false);
    } finally {
      setExecuting(null);
      setFlipflopStep(null);
      setFlipflopAxis(null);
      setFlipflopDir(null);
    }
  };

  const executeConvertCash = async (amount: number) => {
    if (!character || executing) return;
    setExecuting("convertCash");
    setFlash(null);
    try {
      const res = await fetch("/api/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "convertCash", convertAmount: amount }),
      });
      const data = await res.json();
      if (res.ok) {
        applyCharacter(data.character);
        report("convertCash", data.message, true);
      } else {
        report("convertCash", apiErrorText(data, "Conversion failed."), false);
      }
    } catch {
      report("convertCash", "Network error.", false);
    } finally {
      setExecuting(null);
      setConvertCashOpen(false);
      setConvertCashAmount("");
    }
  };

  // Card art is era- and country-specific: a 1953 US player sees Eisenhower-era
  // American photography, a DD player sees Volkskammer-era East German photography,
  // and anything without bespoke national art falls back to the era-generic set.
  // Resolved from the LIVE year, not the seed preset, so a 1953-seeded world
  // sitting in 1985 gets 1985 art. Art tiers are discrete, which is exactly what
  // `eraIdForYear` is for.
  const era =
    worldFlags.currentYear != null
      ? eraIdForYear(worldFlags.currentYear)
      : eraForPreset(worldFlags.preset);
  const countryId = character?.countryId ?? null;
  // Deliberately not `getEraConfig().label` — that would pull the whole
  // landing-page era config (every era's copy and nation list) into this bundle.
  const eraLabel = String(worldFlags.currentYear ?? era);
  const cardImages = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of CARDS) map[c.type] = getActionImage(c.imageSlug, { era, countryId });
    return map;
  }, [era, countryId]);

  const cards = useMemo<ActionCard[]>(
    () =>
      CARDS.map((card) =>
        card.type === "targetedAds"
          ? {
              ...card,
              label: adText("title"),
              tagline: adText("actionTagline"),
              flavor: adText("actionFlavor"),
              fundLabel: () => adText("actionCost"),
              effect: adText("actionEffect"),
              imageAlt: adText("actionImageAlt"),
            }
          : card
      ),
    [adText]
  );

  const influence = character?.politicalInfluence ?? 0;

  const actionCosts = useMemo<ActionCosts | null>(() => {
    if (!character) return null;
    // Face value in the campaign treasury's own currency, computed by the same
    // helper the server credits with (ticket 1107). Never pass this through the
    // live-forex formatter: campaign funds convert at the frozen base rate.
    const fundraiseAmount = fundraiseYieldLocal(
      character,
      !!character.currencyBalances,
      campaignRates,
      worldFlags.campaignPriceLevel,
      worldFlags.preset
    );
    const quoteTarget = homeState
      ? {
          gdpMillions: homeState.gdp,
          population: homeState.population,
          countryId: character.countryId,
          // Same era baseline the server executes with (see executeAction):
          // without this a 1953-world card would quote modern-era costs.
          preset: worldFlags.preset,
        }
      : undefined;
    // Same rules quotes the server executes. When a quote rejects (maxed stat,
    // unallocated stats, or home-state economics still loading), the AP cost
    // stays displayable from the stat alone while the fund cost reports 0:
    // GDP-scaled cards already block fund display until home-state data loads,
    // and the server rejects execution with the quote reason.
    const buildDonorBaseQuote = quoteBuildDonorBaseAction(
      { donorBaseLevel: character.donorBaseLevel, fundraising: character.stats?.fundraising },
      quoteTarget,
      worldFlags.campaignPriceLevel
    );
    const buildDonorBaseFundCost = buildDonorBaseQuote.ok ? buildDonorBaseQuote.fundCostAnchor : 0;
    const campaignQuote = quoteCampaignAction(
      {
        politicalInfluence: influence,
        charisma: character.stats?.charisma,
        intellect: character.stats?.intellect,
      },
      quoteTarget,
      worldFlags.campaignPriceLevel
    );
    const advertiseQuote = quoteAdvertiseAction(
      { favorability: character.favorability, charisma: character.stats?.charisma },
      quoteTarget,
      worldFlags.campaignPriceLevel
    );
    return {
      fundraiseAmount,
      donorUpgradeCost: buildDonorBaseFundCost,
      campaignActionCost: campaignQuote.ok
        ? campaignQuote.apCost
        : getCampaignActionCost(influence),
      campaignFundCost: campaignQuote.ok ? campaignQuote.fundCostAnchor : 0,
      campaignMaxed: !isCampaignEligible(influence),
      advertiseActionCost: advertiseQuote.ok
        ? advertiseQuote.apCost
        : getAdvertiseActionCost(character?.favorability ?? 0),
      advertiseFundCost: advertiseQuote.ok ? advertiseQuote.fundCostAnchor : 0,
      fundraiseActionCost: getDonorActionCost(character?.donorBaseLevel ?? 0, "fundraise"),
      buildDonorBaseActionCost: buildDonorBaseQuote.ok
        ? buildDonorBaseQuote.apCost
        : getDonorActionCost(character?.donorBaseLevel ?? 0, "buildDonorBase"),
      buildDonorBaseFundCost,
      campaignInfluenceGain: campaignQuote.ok ? campaignQuote.influenceGain : null,
      advertiseFavorabilityGain: advertiseQuote.ok ? advertiseQuote.favorabilityGain : null,
    };
  }, [
    character,
    influence,
    homeState,
    campaignRates,
    worldFlags.preset,
    worldFlags.campaignPriceLevel,
  ]);

  const forexEnabled = !!character?.currencyBalances;
  // LOCAL home-currency balance — canonical source of truth. #885: when forex
  // is on, NEVER fall back to the legacy anchor `funds` field; it is USD-scaled
  // and reads as a tiny local balance in a high-denomination currency.
  const displayCampaignFundsStored = forexEnabled
    ? (character?.currencyBalances?.campaign ?? 0)
    : (character?.funds ?? 0);
  const displayPersonalWealth = character
    ? getTotalPersonalLiquidWealth(character, forexEnabled)
    : 0;

  // One-use outcome previews, from the same quotes the server executes. Shown
  // on the cards as "Influence 12.0% to 13.0%" so a player sees what a click
  // buys before spending it.
  const projections: Partial<Record<string, ActionProjection>> = {};
  if (character && actionCosts) {
    const pct = (v: number) => `${Math.min(100, Math.max(0, v)).toFixed(1)}%`;
    if (actionCosts.campaignInfluenceGain !== null) {
      projections.campaign = {
        label: "Influence",
        from: pct(influence),
        to: pct(influence + actionCosts.campaignInfluenceGain),
      };
    }
    if (actionCosts.advertiseFavorabilityGain !== null) {
      const favorability = character.favorability ?? 50;
      projections.advertise = {
        label: "Favorability",
        from: pct(favorability),
        to: pct(favorability + actionCosts.advertiseFavorabilityGain),
      };
    }
    const campaignCurrency = getHomeCurrency(character);
    projections.fundraise = {
      label: "Campaign funds",
      from: formatCurrencyFaceAmount(displayCampaignFundsStored, campaignCurrency),
      to: formatCurrencyFaceAmount(
        displayCampaignFundsStored + actionCosts.fundraiseAmount,
        campaignCurrency
      ),
    };
    const donorLevel = character.donorBaseLevel ?? 0;
    projections.buildDonorBase = {
      label: "Donor level",
      from: String(donorLevel),
      to: String(donorLevel + 1),
    };
  }

  return {
    character,
    homeState,
    // Wait on world flags too: resolving art before the era is known would paint
    // the 2019 fallback set for a frame and then swap it for the 1953 set.
    ready: !loading && !!worldFlags.loaded && !!character && !!actionCosts,
    era,
    eraLabel,
    countryId,
    executing,
    flash,
    flipflopStep,
    flipflopAxis,
    flipflopDir,
    setFlipflopStep,
    setFlipflopAxis,
    setFlipflopDir,
    convertCashOpen,
    convertCashAmount,
    setConvertCashOpen,
    setConvertCashAmount,
    campaignAction,
    setCampaignAction,
    execute,
    executeFlipflop,
    executeConvertCash,
    fetchCharacter,
    actionCosts,
    projections,
    forexEnabled,
    displayCampaignFundsStored,
    displayCampaignFunds: displayCampaignFundsStored,
    displayPersonalWealth,
    blockGdpScaledCosts: homeState === null,
    cards,
    cardImages,
  };
}
