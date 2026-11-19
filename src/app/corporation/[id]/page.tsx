"use client";
import { renderCorporationDetailPageView } from "./page.view";

import { abandonSectorRequest } from "@/lib/corporations/abandonSectorClient";
import {
  mothballSectorRequest,
  type MothballAction,
} from "@/lib/corporations/mothballSectorClient";
import { useGameEvents } from "@/hooks/useGameEvents";

import { InlineError } from "@/components/ui/InlineError";
import { apiErrorText, defaultMessageFor, newRequestRef } from "@/lib/errors/catalog";
import { readApiError, toDisplayError } from "@/lib/errors/client";
import { isTransientRequestFailure, isTransportFailure } from "@/lib/errors/transient";
import { captureClientExceptionWithId } from "@/lib/observability/sentryClientLazy";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";

import { Skeleton } from "@/components/ui";
import { ErrorRef } from "@/components/ui/ErrorRef";
import BackButton from "@/components/BackButton";
import { useToast } from "@/contexts/ToastContext";
import { getExchangeForCountry } from "@/lib/constants/exchangeRegistry";
import type { MoneyPeriod } from "@/lib/constants/moneyTimescale";

import { useCorporationPageData } from "./useCorporationPageData";

import { useSiteNavbarHeight } from "@/components/corporation/ledger/useSiteNavbarHeight";

import { NewFeatureBadge } from "@/components/ui";
import { useFeatureSeen } from "@/hooks/useFeatureSeen";
import { CORP_PAGE_FEATURE_KEYS } from "@/lib/ui/corpPageFeatureKeys";

import {
  CORP_TABS,
  CEO_TAB,
  DEALS_TAB,
  STRUCTURE_TAB,
} from "@/components/corporation/CorporationPageConstants";
import { resolveSuperTabs } from "@/components/nav/SuperTabNav";
import {
  ALL_CORP_TABS,
  CORP_LEGACY_TAB_MAP,
  buildCorpNavTabs,
  corpNavLocation,
  corpTabIdFor,
} from "@/components/corporation/CorporationTabGroups";
import {
  filterPrivateCorpBaseTabs,
  getPrivateCorpTabAccess,
} from "@/components/corporation/privateCorpTabAccess";
import dynamic from "next/dynamic";

// Section bodies that only mount on a non-default tab are code-split: the
// corporation page is the highest-traffic route family (67k views / 30 days),
// and its statically imported tab bodies made up most of its 172 KB of
// route-specific JS. Each still renders on demand with a skeleton in between.
const SectionFallback = () => (
  <div className="h-40 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
);

const FinancialsTab = dynamic(() => import("@/components/corporation/FinancialsTab"), {
  loading: SectionFallback,
});
const PrivateSalePanel = dynamic(() => import("@/components/corporation/shares/PrivateSalePanel"), {
  loading: SectionFallback,
});
const AdvertisingAgreementsPanel = dynamic(
  () => import("@/components/corporation/AdvertisingAgreementsPanel"),
  { loading: SectionFallback }
);
const ProductStudio = dynamic(
  () => import("@/components/corporation/ProductStudio").then((m) => m.ProductStudio),
  { loading: SectionFallback }
);
const SponsoredFundPanel = dynamic(() => import("@/components/corporation/SponsoredFundPanel"), {
  loading: SectionFallback,
});
const BankConsoleTab = dynamic(
  () => import("./bank/BankConsoleTab").then((m) => m.BankConsoleTab),
  { loading: SectionFallback }
);

const NationalCorporationView = dynamic(
  () =>
    import("@/components/national/NationalCorporationView").then((m) => m.NationalCorporationView),
  { loading: SectionFallback }
);
import { TabFallback } from "@/components/corporation/CorporationPageTabs";

const LegacyProductProjects = dynamic(
  () =>
    import("@/components/corporation/LegacyProductProjects").then((m) => m.LegacyProductProjects),
  { loading: () => null }
);
import type {
  CorporationDetail,
  CEO,
  Financials,
  SectorDetail,
  BalanceSheet,
  BondInfo,
  CorpTabId,
  CorporationDefenceView,
  FinancialFogMeta,
} from "@/components/corporation/CorporationPageTypes";
import { shouldShowBankTab } from "./bank/showBankTab";

type CorporationResponseError = Error & {
  code: "CLIENT_ERROR";
  status: number;
  url: string;
  contentType: string | null;
  parseErrorName: string;
  parseErrorMessage: string;
};

async function readCorporationResponse(res: Response, url: string) {
  try {
    return await res.json();
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    if (isTransportFailure(cause)) throw cause;
    const parseError = cause instanceof Error ? cause : new Error("Unknown JSON parse failure");
    const error = new Error(defaultMessageFor("CLIENT_ERROR")) as CorporationResponseError;
    error.name = "CorporationResponseError";
    error.code = "CLIENT_ERROR";
    error.status = res.status;
    error.url = url;
    error.contentType = res.headers.get("content-type");
    error.parseErrorName = parseError.name;
    error.parseErrorMessage = parseError.message;
    Object.assign(error, { cause });
    throw error;
  }
}

function useCorporationDetailPageContext() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { showToast } = useToast();
  const id = params.id as string;

  const [corporation, setCorporation] = useState<CorporationDetail | null>(null);
  const [ceo, setCeo] = useState<CEO | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [sectors, setSectors] = useState<SectorDetail[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [financialFogOfWar, setFinancialFogOfWar] = useState<FinancialFogMeta | null>(null);
  // Sibling of `corporation` in the payload, not a field on it.
  const [defenceContracts, setDefenceContracts] = useState<CorporationDefenceView | null>(null);
  const [ceoIsInactive, setCeoIsInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorRef, setErrorRef] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modViewEnabled, setModViewEnabled] = useState(false);
  const [modViewLoading, setModViewLoading] = useState(false);
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
  const [myCashOnHand, setMyCashOnHand] = useState<number>(0);
  const [myCurrencyBalances, setMyCurrencyBalances] = useState<Partial<Record<string, number>>>({});
  const [myHomeCurrency, setMyHomeCurrency] = useState<string>("USD");
  const [myAutoConvertEnabled, setMyAutoConvertEnabled] = useState(true);
  const [myCorporation, setMyCorporation] = useState<{
    id: string;
    name: string;
    liquidCapital: number;
    liquidCurrencyCode?: string;
    isInvestmentBank?: boolean;
  } | null>(null);
  const isCeo =
    !!corporation &&
    !!myCharacterId &&
    ((!corporation.ceoVacant && ceo?.characterId === myCharacterId) ||
      corporation.caretakerUnderlyingCharacterId === myCharacterId);
  const isPendingCeo =
    !!corporation && !!myCharacterId && corporation.pendingCeoCharacterId === myCharacterId;
  const hasLoaded = useRef(false);
  // Sticky tabs on a phone sit under the site navbar; measured on the page root.
  const navbarRootRef = useSiteNavbarHeight();

  // Bond/credit rating state
  const [bondInfo, setBondInfo] = useState<BondInfo | null>(null);
  const [bondDefaultModalOpen, setBondDefaultModalOpen] = useState(false);
  const bondInfoLoadedRef = useRef(false);
  const bondInfoPromiseRef = useRef<Promise<void> | null>(null);
  const [showBankTab, setShowBankTab] = useState(false);

  // Sectors state
  const [abandoningSectorId, setAbandoningSectorId] = useState<string | null>(null);
  const [sectorsMessage, setSectorsMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  // Tab state — URL-driven, grouped two-level nav (same pattern as the state
  // page). `?tab=` is the super-tab (group) and `?sub=` is the sub-tab; the old
  // flat `?tab=<tabId>` deep links resolve through CORP_LEGACY_TAB_MAP.
  //
  // This resolution deliberately uses the ungated tab list: it runs before the
  // corporation payload has said what this viewer may see, and it only drives
  // data prefetching. The rendered nav below uses the gated list.
  const groupResolved = resolveSuperTabs(
    buildCorpNavTabs(ALL_CORP_TABS),
    searchParams.get("tab"),
    searchParams.get("sub"),
    CORP_LEGACY_TAB_MAP,
    "overview"
  );
  const activeTab: CorpTabId =
    corpTabIdFor(ALL_CORP_TABS, groupResolved.superTab, groupResolved.subTab) ?? "overview";
  const commoditiesTabDiscovery = useFeatureSeen(CORP_PAGE_FEATURE_KEYS.commoditiesTab);
  const { isNew: commoditiesTabIsNew, markSeen: markCommoditiesTabSeen } = commoditiesTabDiscovery;

  // Started here, with the first paint, rather than in the components that render
  // the answers: those only mount after the corporation payload lands, which put
  // both behind a second round trip on the highest-traffic page in the game.
  const { nationalizationStatus, openVotes } = useCorporationPageData(id, activeTab === "overview");

  const corpIsPrivate = !!corporation?.isPrivate;

  /**
   * Jump to a tab by its (stable) tab id — used by in-page links such as the
   * Overview tab's shortcuts into Sectors, Shares, and Credit.
   */
  const setTab = (tabId: CorpTabId) => {
    const target = corpNavLocation(ALL_CORP_TABS, tabId);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", target.superTab);
    if (target.subTab) {
      p.set("sub", target.subTab);
    } else {
      p.delete("sub");
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // Dismiss the commodities "New" badge when landing via URL (bookmark / deep link).
  useEffect(() => {
    if (activeTab === "commodities") {
      markCommoditiesTabSeen();
    }
  }, [activeTab, markCommoditiesTabSeen]);

  const makeCorpApiUrl = useCallback(
    (suffix = "") => {
      const base = `/api/corporations/${id}${suffix}`;
      return modViewEnabled ? `${base}${base.includes("?") ? "&" : "?"}modView=1` : base;
    },
    [id, modViewEnabled]
  );

  const resetViewerContext = useCallback(() => {
    setMyCharacterId(null);
    setMyCashOnHand(0);
    setMyCurrencyBalances({});
    setMyHomeCurrency("USD");
    setMyAutoConvertEnabled(true);
    setMyCorporation(null);
  }, []);

  const fetchCorporation = useCallback(async () => {
    const url = makeCorpApiUrl();

    // Only show the full-page skeleton on the initial load; refreshes update data silently
    // so that local subtab state (e.g. CEO Office subtab) is not reset on save.

    return fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          // A proxy error or deploy restart can return an empty or non-JSON body, so read
          // the error envelope leniently instead of letting res.json() throw.
          const apiError = await readApiError(res);
          const body = { error: apiError.message, code: apiError.code, ref: apiError.ref };
          if (!hasLoaded.current) {
            // Only set page-level error on initial load — refresh failures should not
            // destroy the entire page when we already have valid data displayed.
            setError(apiErrorText(body, "Corporation not found"));
            setErrorRef(apiError.ref ?? null);
          } else {
            showToast(apiErrorText(body, "Failed to refresh corporation data"), "error");
          }
          return;
        }
        const data = await readCorporationResponse(res, url);
        setError("");
        setErrorRef(null);
        setCorporation(data.corporation);
        setCeo(data.ceo);
        setFinancials(data.financials);
        setSectors(data.sectors);
        setBalanceSheet(data.balanceSheet);
        setFinancialFogOfWar(data.financialFogOfWar ?? null);
        setDefenceContracts(data.defenceContracts ?? null);
        setCeoIsInactive(data.ceoIsInactive === true);
      })
      .catch(async (err) => {
        const display = toDisplayError(err, "Failed to load corporation data");
        if (isTransientRequestFailure(err)) {
          // A dropped connection or timeout is not an application fault: show the
          // retryable network message without reporting it or inventing a ref.
          const message = apiErrorText(
            { error: display.message, code: display.code },
            display.message
          );
          if (!hasLoaded.current) {
            setError(message);
            setErrorRef(null);
          } else {
            showToast(message, "error");
          }
          return;
        }
        const ref =
          (await captureClientExceptionWithId(err, {
            tags: { feature: "corporation-detail", error_code: display.code },
            extra:
              err instanceof Error && err.name === "CorporationResponseError"
                ? {
                    url,
                    status: (err as CorporationResponseError).status,
                    contentType: (err as CorporationResponseError).contentType,
                    parseErrorName: (err as CorporationResponseError).parseErrorName,
                    parseErrorMessage: (err as CorporationResponseError).parseErrorMessage,
                  }
                : { url },
          })) ?? newRequestRef();
        const message = apiErrorText(
          { error: display.message, code: display.code, ref },
          display.message
        );
        if (!hasLoaded.current) {
          setError(message);
          setErrorRef(ref);
        } else {
          showToast(message, "error");
        }
      })
      .finally(() => {
        hasLoaded.current = true;
        setLoading(false);
      });
  }, [makeCorpApiUrl, showToast]);

  useEffect(() => {
    fetchCorporation();
  }, [fetchCorporation]);
  useGameEvents(() => void fetchCorporation(), ["turn_complete", "market_tick"]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/banking/corporation/${id}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          visible?: boolean;
          charter?: unknown;
          canIssueCharter?: boolean;
        };
        if (!cancelled) setShowBankTab(shouldShowBankTab(json));
      })
      .catch(() => {
        if (!cancelled) setShowBankTab(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const fetchViewerContext = useCallback(async () => {
    return Promise.all([fetch("/api/character/me"), fetch("/api/auth/me")])
      .then(async ([characterRes, authRes]) => {
        if (!characterRes.ok) {
          if (characterRes.status === 401) {
            resetViewerContext();
          }
        } else {
          const data = (await characterRes.json()) as {
            character?: {
              _id: string;
              cashOnHand?: number;
              currencyBalances?: { personal?: Partial<Record<string, number>> };
              homeCurrency?: string;
              autoConvertEnabled?: boolean;
            } | null;
            corporation?: {
              _id: string;
              name: string;
              liquidCapital?: number;
              liquidCurrencyCode?: string;
              isInvestmentBank?: boolean;
              isNationalCorp?: boolean;
            } | null;
          };
          if (!data.character) {
            resetViewerContext();
          } else {
            setMyCharacterId(data.character._id);
            // Post-Phase-8: prefer the per-currency personal balance in the
            // character's home currency; fall back to the legacy cashOnHand field
            // for any pre-migration clients.
            const homeCurrency = data.character.homeCurrency ?? "USD";
            setMyCashOnHand(
              data.character.currencyBalances?.personal?.[homeCurrency] ??
                data.character.cashOnHand ??
                0
            );
            setMyCurrencyBalances(data.character.currencyBalances?.personal ?? {});
            setMyHomeCurrency(homeCurrency);
            setMyAutoConvertEnabled(data.character.autoConvertEnabled ?? true);

            if (
              data.corporation &&
              data.corporation._id !== id &&
              !data.corporation.isNationalCorp
            ) {
              setMyCorporation({
                id: data.corporation._id,
                name: data.corporation.name,
                liquidCapital: data.corporation.liquidCapital ?? 0,
                liquidCurrencyCode: data.corporation.liquidCurrencyCode,
                isInvestmentBank: data.corporation.isInvestmentBank,
              });
            } else {
              setMyCorporation(null);
            }
          }
        }
        if (authRes.ok) {
          const authData = (await authRes.json()) as {
            user?: { isModerator?: boolean; isAdmin?: boolean } | null;
          };
          const admin = Boolean(authData.user?.isAdmin);
          setIsAdmin(admin);
          setIsModerator(Boolean(authData.user?.isModerator) && !admin);
        } else {
          setIsModerator(false);
          setIsAdmin(false);
        }
      })
      .catch(async () => {
        // Preserve the current viewer state on transient failures.
      });
  }, [id, resetViewerContext]);
  const enableModView = useCallback(async () => {
    if (!corporation) return;
    setModViewLoading(true);
    try {
      const res = await fetch("/api/moderator/mod-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "corporation",
          targetId: corporation._id,
          targetName: corporation.name,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorText(payload, "Failed to enable Mod View"));
        return;
      }
      setModViewEnabled(true);
      setError("");
    } catch {
      setError("Failed to enable Mod View");
    } finally {
      setModViewLoading(false);
    }
  }, [corporation]);

  useEffect(() => {
    void fetchViewerContext();
  }, [fetchViewerContext]);

  // Legacy ?tab=portfolio — corporate holdings now live on the shared portfolio page.
  useEffect(() => {
    if (searchParams.get("tab") !== "portfolio" || !corporation || corporation.countryOwnerId) {
      return;
    }
    const pathSeg =
      corporation.sequentialId != null ? String(corporation.sequentialId) : corporation._id;
    router.replace(`/portfolio/corporation/${pathSeg}`);
  }, [searchParams, corporation, router]);

  // CEO bond-default crisis modal (non-national corps only)
  useEffect(() => {
    if (!isCeo || !corporation || corporation.countryOwnerId) return;
    async function checkBondDefault() {
      try {
        const res = await fetch(`/api/corporations/${id}/bond-default`);
        if (!res.ok) return;
        const j = await res.json();
        if (j.active) setBondDefaultModalOpen(true);
      } catch {
        // ignore
      }
    }
    void checkBondDefault();
  }, [isCeo, corporation, id]);

  // Fetch bond info for credit rating, bonds, and financials tabs

  const fetchBondInfo = useCallback(
    async (options?: { force?: boolean }) => {
      if (bondInfoPromiseRef.current) {
        if (!options?.force) return bondInfoPromiseRef.current;
        await bondInfoPromiseRef.current;
      }
      if (bondInfoLoadedRef.current && !options?.force) return;

      const request = (async () => {
        try {
          const res = await fetch(makeCorpApiUrl("/bonds"));
          if (res.ok) {
            const data = await res.json();
            setBondInfo(data);
            bondInfoLoadedRef.current = true;
          }
        } catch {
          // ignore
        }
      })();

      bondInfoPromiseRef.current = request.finally(() => {
        bondInfoPromiseRef.current = null;
      });

      return bondInfoPromiseRef.current;
    },
    [makeCorpApiUrl]
  );

  useEffect(() => {
    if (activeTab === "overview" || activeTab === "credit" || activeTab === "financials") {
      void fetchBondInfo();
    }
  }, [activeTab, fetchBondInfo]);

  useEffect(() => {
    if (
      corporation &&
      (isCeo || corporation.viewerIsControllingParentCeo) &&
      !corporation.countryOwnerId
    ) {
      void fetchBondInfo();
    }
  }, [isCeo, corporation, fetchBondInfo]);

  async function handleAcceptCeo() {
    try {
      const res = await fetch(`/api/corporations/${id}/ceo/accept`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        void fetchCorporation();
        void fetchViewerContext();
      } else {
        setError(apiErrorText(data, "Failed to accept CEO position"));
      }
    } catch {
      setError("Network error");
    }
  }

  async function handleDeclineCeo() {
    try {
      const res = await fetch(`/api/corporations/${id}/ceo/decline`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        void fetchCorporation();
        void fetchViewerContext();
      } else {
        setError(apiErrorText(data, "Failed to decline CEO position"));
      }
    } catch {
      setError("Network error");
    }
  }

  const [periodView, setPeriodView] = useState<MoneyPeriod>("turn");

  const [strategyUpdatingSectorId, setStrategyUpdatingSectorId] = useState<string | null>(null);

  async function handleSectorStrategyChange(sectorId: string, strategyId: string) {
    setStrategyUpdatingSectorId(sectorId);
    setSectorsMessage(null);
    try {
      const res = await fetch(`/api/corporations/${id}/sectors/${sectorId}/strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSectorsMessage({
          type: "success",
          text: `Strategy changed to ${data.strategyName}. Transition begins (${data.transitionTurns} turns).`,
        });
        fetchCorporation();
      } else {
        setSectorsMessage({ type: "error", text: apiErrorText(data, "Failed to change strategy") });
      }
    } catch {
      setSectorsMessage({ type: "error", text: "Network error" });
    } finally {
      setStrategyUpdatingSectorId(null);
    }
  }

  // A set, so a second row clicked while the first is in flight does not clear
  // the first one's busy state; the ref drops a double click before re-render.
  const [mothballingSectorIds, setMothballingSectorIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const mothballInFlight = useRef(new Set<string>());

  // Suggestion 412: mothball or reactivate straight from the sector row's menu,
  // through the same build route the sector page uses.
  async function handleSectorMothball(sectorId: string, action: MothballAction) {
    if (mothballInFlight.current.has(sectorId)) return;
    mothballInFlight.current.add(sectorId);
    setMothballingSectorIds(new Set(mothballInFlight.current));
    setSectorsMessage(null);
    try {
      const { ok, data } = await mothballSectorRequest(String(id), sectorId, action);
      if (ok) {
        setSectorsMessage({
          type: "success",
          text:
            action === "mothball"
              ? "Mothballed. These plants make nothing while stowed, and still cost upkeep."
              : "Reactivated. These plants run again.",
        });
        fetchCorporation();
      } else {
        setSectorsMessage({
          type: "error",
          text: apiErrorText(data, action === "mothball" ? "Mothball failed" : "Reactivate failed"),
        });
      }
    } catch {
      setSectorsMessage({ type: "error", text: "Network error" });
    } finally {
      mothballInFlight.current.delete(sectorId);
      setMothballingSectorIds(new Set(mothballInFlight.current));
    }
  }

  const [cancelTransitionSectorId, setCancelTransitionSectorId] = useState<string | null>(null);

  async function handleCancelTransition(sectorId: string) {
    setCancelTransitionSectorId(sectorId);
    setSectorsMessage(null);
    try {
      const res = await fetch(`/api/corporations/${id}/sectors/${sectorId}/strategy/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSectorsMessage({ type: "success", text: "Transition cancelled, reversing now." });
        fetchCorporation();
      } else {
        setSectorsMessage({
          type: "error",
          text: apiErrorText(data, "Failed to cancel transition"),
        });
      }
    } catch {
      setSectorsMessage({ type: "error", text: "Network error" });
    } finally {
      setCancelTransitionSectorId(null);
    }
  }

  const [growthUpdatingSectorId, setGrowthUpdatingSectorId] = useState<string | null>(null);
  // Debounce rapid growth clicks: accumulate the latest rate, then fire one request after a short pause
  const growthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const growthPendingRef = useRef<{ sectorId: string; newRate: number } | null>(null);

  function handleGrowthChange(sectorId: string, newRate: number) {
    growthPendingRef.current = { sectorId, newRate };
    setGrowthUpdatingSectorId(sectorId);
    setSectorsMessage(null);

    if (growthTimerRef.current) clearTimeout(growthTimerRef.current);
    growthTimerRef.current = setTimeout(async () => {
      const pending = growthPendingRef.current;
      if (!pending) return;
      growthPendingRef.current = null;
      try {
        const res = await fetch(`/api/corporations/${id}/sectors/${pending.sectorId}/growth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetGrowthRate: pending.newRate }),
        });
        const data = await res.json();
        if (res.ok) {
          fetchCorporation();
        } else {
          setSectorsMessage({
            type: "error",
            text: apiErrorText(data, "Failed to update growth rate"),
          });
        }
      } catch {
        setSectorsMessage({ type: "error", text: "Network error" });
      } finally {
        setGrowthUpdatingSectorId(null);
      }
    }, 400); // 400ms debounce — fast enough to feel responsive, slow enough to batch rapid clicks
  }

  async function handleAbandonSector(sectorId: string) {
    if (
      !confirm(
        "Abandon this sector? An NPP operator takes over most of its built plants. This cannot be undone."
      )
    ) {
      return;
    }
    setAbandoningSectorId(sectorId);
    setSectorsMessage(null);
    try {
      const { ok, cancelled, data } = await abandonSectorRequest(String(id), sectorId);
      if (cancelled) return;
      if (ok) {
        setSectorsMessage({ type: "success", text: String(data.message ?? "") });
        fetchCorporation();
      } else {
        setSectorsMessage({ type: "error", text: apiErrorText(data, "Failed to abandon sector") });
      }
    } catch {
      setSectorsMessage({ type: "error", text: "Network error" });
    } finally {
      setAbandoningSectorId(null);
    }
  }

  if (loading) {
    return {
      kind: "render" as const,
      node: (
        <div className="min-h-screen bg-background pb-16" data-replay-block>
          <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8 overflow-x-hidden">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-4 w-40" />
            </div>

            {/* Masthead: name, identity line, then the quote beside the figures grid */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-8 w-72 max-w-full" />
                <Skeleton className="h-3.5 w-[28rem] max-w-full" />
              </div>
              <div className="flex flex-col gap-x-10 gap-y-4 border-t border-card-border pt-4 lg:flex-row">
                <Skeleton className="h-8 w-40" />
                <div className="grid flex-1 grid-cols-3 gap-x-6 gap-y-3 md:grid-cols-5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="border-b border-card-border">
              <div className="flex gap-6 pb-px overflow-x-auto">
                {["Overview", "Financials", "Sectors", "Shares", "Credit & Bonds", "Charts"].map(
                  (label) => (
                    <Skeleton key={label} className="h-9 w-20 shrink-0" />
                  )
                )}
              </div>
            </div>

            {/* Tab content — same skeleton the dynamic() tab imports show */}
            <TabFallback />
          </main>
        </div>
      ),
    };
  }

  // State-owned corps render the distinct state-instrument page (spec §17), not the
  // private/market chrome. Branch before the financials-based error guard so a
  // National Corporation always routes to its own view regardless of fog state.
  if (corporation?.countryOwnerId) {
    return {
      kind: "render" as const,
      node: (
        <div className="min-h-screen bg-background pb-16" data-replay-block>
          <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
            {/* CEO appointment offer — the appoint-ceo flow sets pendingCeoCharacterId
              and the nominee accepts here (the state-instrument view has no other
              accept surface). */}
            {isPendingCeo && (
              <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4">
                <div className="mb-1 text-sm font-semibold text-warning">
                  You&apos;ve been appointed CEO of {corporation.name}
                </div>
                <p className="mb-3 text-xs text-muted">
                  The treasury has nominated you to lead this National Corporation. You may only
                  hold one CEO position at a time.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleAcceptCeo}
                    className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-success/90"
                  >
                    Accept position
                  </button>
                  <button
                    onClick={handleDeclineCeo}
                    className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Decline
                  </button>
                </div>
                <InlineError error={error} className="mt-3 text-xs text-error" />
              </div>
            )}
            <NationalCorporationView corpId={id} />
          </main>
        </div>
      ),
    };
  }

  if (error || !corporation || (!financials && !corporation.isPrivate)) {
    return {
      kind: "render" as const,
      node: (
        <div className="min-h-screen bg-background pb-16" data-replay-block>
          <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
            <div className="rounded-xl border border-error/30 bg-error/10 p-6 text-center">
              <h2 className="text-lg font-semibold text-error">
                {error || "Corporation not found"}
              </h2>
              {errorRef && (
                <div className="mt-3 flex justify-center">
                  <ErrorRef code={errorRef} />
                </div>
              )}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    hasLoaded.current = false;
                    setError("");
                    setErrorRef(null);
                    void fetchCorporation();
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Retry
                </button>
                <BackButton />
              </div>
            </div>
          </main>
        </div>
      ),
    };
  }

  const isNationalCorp = !!corporation.countryOwnerId;
  const privateCorpTabAccess = getPrivateCorpTabAccess({
    isPrivate: !!corporation.isPrivate,
    isCeo,
    viewerIsControllingParentCeo: !!corporation.viewerIsControllingParentCeo,
    viewerIsShareholder: !!corporation.viewerIsShareholder,
    modViewEnabled,
  });
  const baseTabs = isNationalCorp
    ? CORP_TABS.filter((t) => t.id === "overview" || t.id === "financials" || t.id === "sectors")
    : filterPrivateCorpBaseTabs(CORP_TABS, privateCorpTabAccess);
  // The Tech tab only appears when the sector-tech-trees feature gate is on.
  const gatedBaseTabs0 = corporation.techTreesEnabled
    ? baseTabs
    : baseTabs.filter((t) => t.id !== "tech");
  // Existing concessions remain visible when new contract issuance is paused.
  const isExtractionCorp =
    corporation.type === "extraction" || corporation.secondaryType === "extraction";
  const gatedBaseTabs = isExtractionCorp
    ? gatedBaseTabs0
    : gatedBaseTabs0.filter((t) => t.id !== "contracts");
  // The Defence tab only appears for corps that actually build materiel — defence as the
  // primary or the secondary focus. A corp with no defence line can never hold a
  // procurement contract, so the tab would be permanently empty.
  const isDefenceCorp = corporation.type === "defense" || corporation.secondaryType === "defense";
  const gatedTabs = isDefenceCorp ? gatedBaseTabs : gatedBaseTabs.filter((t) => t.id !== "defence");
  // Structure is only offered when the subsidiary panel has something to
  // render. Supply agreements live with commodity operations so both CEOs can
  // find the negotiation surface without opening an ownership tab.
  const showSubsidiaryPanel =
    !!corporation.isFormalizedSubsidiary ||
    !!corporation.canFormalizeAsSubsidiary ||
    !!corporation.canManageAsParent ||
    !!corporation.canSpinOff;
  const showSupplyAgreements = isCeo && !isNationalCorp && !!corporation.supplyAgreementsEnabled;
  // The group chart has something to show for any corporation in a group,
  // even to a viewer with no structure action to take.
  const showStructureTab =
    showSubsidiaryPanel ||
    !!corporation.parentCorporation ||
    (corporation.subsidiaries?.length ?? 0) > 0;

  const visibleTabs = [
    ...gatedTabs,
    ...(isCeo && !isNationalCorp && corporation.canManageAcquisitions ? [DEALS_TAB] : []),
    ...(showStructureTab ? [STRUCTURE_TAB] : []),
    ...(isCeo && !isNationalCorp ? [CEO_TAB] : []),
  ];
  const bankVisible = showBankTab;
  const navTabs = [
    ...buildCorpNavTabs(visibleTabs, {
      badges: {
        commodities: commoditiesTabIsNew ? <NewFeatureBadge /> : undefined,
      },
    }),
    ...(bankVisible
      ? [
          {
            id: "bank",
            label: "Bank",
            tooltip: "Bank charter, rates, blacklist, and loan book",
            icon: (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                />
              </svg>
            ),
          },
        ]
      : []),
  ];

  // A country with no configured venue links to the global market rather than
  // claiming a NYSE listing it does not have.
  const exchangeName = corporation.countryId
    ? getExchangeForCountry(corporation.countryId)
    : undefined;
  const exchange = exchangeName ? corporation.countryId! : "global";
  const exchangeLabel = exchangeName ?? "Global";

  // Trading happens on the Shares tab; `trade=1` opens the ticket on arrival.
  const canTrade = !!myCharacterId && !corporation.isPrivate;
  const openTrade = () => {
    const target = corpNavLocation(visibleTabs, "shares");
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", target.superTab);
    if (target.subTab) p.set("sub", target.subTab);
    else p.delete("sub");
    p.set("trade", "1");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return {
    kind: "context" as const,
    context: {
      AdvertisingAgreementsPanel,
      BankConsoleTab,
      FinancialsTab,
      LegacyProductProjects,
      PrivateSalePanel,
      ProductStudio,
      SponsoredFundPanel,
      abandoningSectorId,
      activeTab,
      balanceSheet,
      bondDefaultModalOpen,
      bondInfo,
      canTrade,
      cancelTransitionSectorId,
      ceo,
      ceoIsInactive,
      corpIsPrivate,
      corporation,
      defenceContracts,
      enableModView,
      error,
      exchange,
      exchangeLabel,
      fetchBondInfo,
      fetchCorporation,
      fetchViewerContext,
      financialFogOfWar,
      financials,
      growthUpdatingSectorId,
      handleAbandonSector,
      handleAcceptCeo,
      handleCancelTransition,
      handleDeclineCeo,
      handleGrowthChange,
      handleSectorMothball,
      handleSectorStrategyChange,
      id,
      isAdmin,
      isCeo,
      isDefenceCorp,
      isExtractionCorp,
      isModerator,
      isPendingCeo,
      modViewEnabled,
      modViewLoading,
      mothballingSectorIds,
      myAutoConvertEnabled,
      myCashOnHand,
      myCharacterId,
      myCorporation,
      myCurrencyBalances,
      myHomeCurrency,
      nationalizationStatus,
      navTabs,
      navbarRootRef,
      openTrade,
      openVotes,
      pathname,
      periodView,
      router,
      searchParams,
      sectors,
      sectorsMessage,
      setBondDefaultModalOpen,
      setMyAutoConvertEnabled,
      setPeriodView,
      setTab,
      showSupplyAgreements,
      showToast,
      strategyUpdatingSectorId,
      visibleTabs,
    },
  };
}
export type CorporationDetailPageViewContext = Extract<
  ReturnType<typeof useCorporationDetailPageContext>,
  { kind: "context" }
>["context"];

function CorporationDetailPageBody(...args: Parameters<typeof useCorporationDetailPageContext>) {
  const result = useCorporationDetailPageContext(...args);
  return result.kind === "render" ? result.node : renderCorporationDetailPageView(result.context);
}

export default function CorporationDetailPage() {
  const params = useParams();
  return <CorporationDetailPageBody key={String(params.id)} />;
}
