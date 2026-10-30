"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useOptionalAuthMe, useRefetchNav } from "@/contexts/AuthDataContext";
import { useEnabledCountries } from "@/contexts/RegisteredCountriesContext";
import { useToast } from "@/contexts/ToastContext";
import {
  ALL_EXCHANGES,
  getExchangeApiKey,
  getExchangeLabel,
} from "@/lib/constants/exchangeRegistry";
import {
  effectiveWidgetLayout,
  EXCHANGE_SCOPED_WIDGETS,
  TICKER_HOME_SCOPE,
  WIDGETS,
  type WidgetAudience,
  type WidgetLayout,
  type WidgetMenu,
} from "@/lib/sidebarWidgets/widgetCatalog";
import type { WidgetOption } from "./WidgetEditor";

export interface WidgetSetup {
  enabled: boolean;
  layout: WidgetLayout;
  options: WidgetOption[];
  menus: WidgetMenu[];
  resolveKey: (key: string) => string;
  trayOpen: boolean;
  saveLayout: (layout: WidgetLayout) => void;
  saveTrayOpen: (open: boolean) => void;
}

function patch(body: Record<string, unknown>) {
  return fetch("/api/settings/experimental-features", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
  });
}

/**
 * Everything the tray and the desktop menus need to place widgets: the
 * player's layout (saved, or role defaults), the widgets they may add, and
 * account saves. Off unless experimental features are on.
 */
export function useWidgetSetup(): WidgetSetup {
  const t = useTranslations("nav.widgets");
  const auth = useOptionalAuthMe();
  const refetchNav = useRefetchNav();
  const { showToast } = useToast();
  const enabledCountries = useEnabledCountries();
  const navData = auth?.navData ?? null;
  const user = navData?.user ?? auth?.user ?? null;
  const enabled = user?.experimentalFeatures === true && navData?.hasCharacter === true;
  const audience: WidgetAudience = {
    hasCorporation: navData?.myCorporationId != null,
    isStaff: user?.isAdmin === true || user?.isModerator === true,
  };
  const homeCountry = navData?.characterCountryId ?? null;
  const homeExchange = homeCountry ? getExchangeApiKey(homeCountry) : undefined;

  const savedJson = JSON.stringify(effectiveWidgetLayout(user?.widgetLayout, audience));
  const [layout, setLayout] = useState<WidgetLayout>(() => JSON.parse(savedJson));
  const lastSaved = useRef(savedJson);
  /* eslint-disable react-hooks/set-state-in-effect -- follow the account once it loads */
  useEffect(() => {
    lastSaved.current = savedJson;
    setLayout(JSON.parse(savedJson) as WidgetLayout);
  }, [savedJson]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const options = useMemo<WidgetOption[]>(() => {
    const list: WidgetOption[] = [];
    if (WIDGETS.myCompany.available(audience))
      list.push({ key: "myCompany", label: t("names.myCompany") });
    list.push({ key: "netWorth", label: t("names.netWorth") });
    list.push({ key: "stockTicker:global", label: t("tickerScopes.global") });
    if (homeExchange)
      list.push({
        key: `stockTicker:${TICKER_HOME_SCOPE}`,
        label: `${t("tickerScopes.home")} · ${getExchangeLabel(homeExchange)}`,
      });
    const enabledSet = new Set<string>(enabledCountries);
    const otherExchanges = ALL_EXCHANGES.filter(
      (exchange) => exchange.apiKey !== homeExchange && enabledSet.has(exchange.countryId)
    );
    for (const exchange of otherExchanges) {
      list.push({ key: `stockTicker:${exchange.apiKey}`, label: exchange.exchangeName });
    }
    const sectors = t("names.sectorHeatmap");
    list.push({ key: "sectorHeatmap:global", label: `${sectors} · ${t("tickerScopes.global")}` });
    if (homeExchange)
      list.push({
        key: `sectorHeatmap:${TICKER_HOME_SCOPE}`,
        label: `${sectors} · ${t("tickerScopes.home")} · ${getExchangeLabel(homeExchange)}`,
      });
    for (const exchange of otherExchanges) {
      list.push({
        key: `sectorHeatmap:${exchange.apiKey}`,
        label: `${sectors} · ${exchange.exchangeName}`,
      });
    }
    list.push({ key: "commodityBoard", label: t("names.commodityBoard") });
    if (WIDGETS.staffQueues.available(audience))
      list.push({ key: "staffQueues", label: t("names.staffQueues") });
    return list;
    // audience is derived from the two flags below each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, homeExchange, enabledCountries, audience.hasCorporation, audience.isStaff]);

  const menus: WidgetMenu[] = [
    ...(navData?.homeState ? (["state"] as const) : []),
    "nation",
    "world",
    "help",
    ...(audience.isStaff ? (["staff"] as const) : []),
  ];

  const resolveKey = useCallback(
    (key: string) => {
      const [id, param] = key.split(":");
      return param === TICKER_HOME_SCOPE &&
        (EXCHANGE_SCOPED_WIDGETS as readonly string[]).includes(id ?? "")
        ? `${id}:${homeExchange ?? "global"}`
        : key;
    },
    [homeExchange]
  );

  const saveLayout = useCallback(
    (next: WidgetLayout) => {
      setLayout(next);
      patch({ widgetLayout: next })
        .then(() => {
          lastSaved.current = JSON.stringify(next);
          refetchNav();
        })
        .catch(() => {
          setLayout(JSON.parse(lastSaved.current) as WidgetLayout);
          showToast(t("tray.saveError"), "error");
        });
    },
    [refetchNav, showToast, t]
  );

  // Open or closed is a convenience; a failed save only means it resets next visit.
  const saveTrayOpen = useCallback((open: boolean) => {
    patch({ widgetTrayOpen: open }).catch(() => undefined);
  }, []);

  return {
    enabled,
    layout,
    options,
    menus,
    resolveKey,
    trayOpen: user?.widgetTrayOpen === true,
    saveLayout,
    saveTrayOpen,
  };
}
