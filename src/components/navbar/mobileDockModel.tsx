"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CountryFlag } from "@/components/CountryFlag";
import { type CountryId } from "@/lib/constants/countriesCore";
import { countryUrl, regionUrl } from "@/lib/urls";
import { isNavActive } from "./experimentalNavPrimitives";
import type { DesktopNavLink, DesktopNavMenu } from "./desktopNavModel";
import {
  MobileDockGridIcon,
  MobileDockIcon,
  type DockSheet,
  type DockSheetKey,
  type DockTab,
} from "./MobileDock";

type MenuKey = "state" | "nation" | "world" | "help" | "staff";

interface MobileDockModelInput {
  enabled: boolean;
  pathname: string;
  pageCountry: CountryId;
  countryName: (id: CountryId) => string;
  homeState?: { id: string; name: string; countryId: string };
  myCorporationId?: number | null;
  isImperialMode: boolean;
  singleplayer: boolean;
  unreadCount: number;
  profileDisplayName: string;
  switchableCountries: CountryId[];
  /** The navbar's menus, already in the player's saved order. */
  menus: Partial<Record<MenuKey, DesktopNavMenu>>;
  link: (
    id: string,
    label: string,
    href?: string,
    extra?: Partial<DesktopNavLink>
  ) => DesktopNavLink;
  onClose: () => void;
  search: ReactNode;
}

/**
 * Tabs and sheets for the phone dock. Tabs follow phone traffic: company (or the
 * market without one), home state, nation, Actions, then More. Every destination
 * the standard phone menu offers stays reachable from a sheet.
 */
export function useMobileDockModel({
  enabled,
  pathname,
  pageCountry,
  countryName,
  homeState,
  myCorporationId,
  isImperialMode,
  singleplayer,
  unreadCount,
  profileDisplayName,
  switchableCountries,
  menus,
  link,
  onClose,
  search,
}: MobileDockModelInput): {
  tabs: DockTab[];
  sheets: Partial<Record<DockSheetKey, DockSheet>>;
} {
  const t = useTranslations("nav");
  if (!enabled) return { tabs: [], sheets: {} };

  const stateHref = homeState ? regionUrl(homeState.countryId, homeState.id) : null;
  const onState = !!stateHref && isNavActive(pathname, stateHref);
  const companyHref = myCorporationId ? `/corporation/${myCorporationId}` : null;
  const nationName = countryName(pageCountry);

  const tabs: DockTab[] = [
    companyHref
      ? {
          id: "company",
          label: t("dock.company"),
          icon: <MobileDockIcon name="briefcase" />,
          href: companyHref,
          active: isNavActive(pathname, companyHref),
        }
      : {
          id: "market",
          label: t("dock.market"),
          icon: <MobileDockIcon name="chart" />,
          href: "/market",
          active: isNavActive(pathname, "/market") || isNavActive(pathname, "/stockmarket"),
        },
  ];
  if (homeState && menus.state)
    tabs.push({
      id: "state",
      label: homeState.name,
      icon: <MobileDockIcon name="map" />,
      sheet: "state",
      active: onState,
    });
  tabs.push({
    id: "nation",
    label: nationName,
    icon: <CountryFlag country={pageCountry} size="sm" />,
    sheet: "nation",
    active: !onState && isNavActive(pathname, countryUrl(pageCountry)),
  });
  if (!isImperialMode)
    tabs.push({
      id: "actions",
      label: t("common.actions"),
      icon: <MobileDockIcon name="bolt" />,
      href: "/actions",
      active: isNavActive(pathname, "/actions"),
    });
  tabs.push({
    id: "more",
    label: t("dock.more"),
    icon: <MobileDockGridIcon />,
    sheet: "more",
    active: false,
  });

  const sheets: Partial<Record<DockSheetKey, DockSheet>> = {};
  if (homeState && menus.state)
    sheets.state = { title: homeState.name, sections: [{ id: "state", menu: menus.state }] };
  if (menus.nation)
    sheets.nation = {
      title: nationName,
      header:
        switchableCountries.length > 1 ? (
          <div
            role="group"
            aria-label={t("dock.switchCountry")}
            className="-mx-3 mb-1 flex gap-1.5 overflow-x-auto px-3 pb-1"
          >
            {switchableCountries.map((country) => (
              <Link
                key={country}
                href={countryUrl(country)}
                onClick={onClose}
                aria-current={country === pageCountry ? "true" : undefined}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${country === pageCountry ? "border-primary/50 bg-primary/10 text-foreground" : "border-card-border text-muted"}`}
              >
                <CountryFlag country={country} size="sm" />
                {countryName(country)}
              </Link>
            ))}
          </div>
        ) : undefined,
      sections: [{ id: "nation", menu: menus.nation }],
    };

  const youLinks: DesktopNavLink[] = [
    link(
      "notifications",
      unreadCount
        ? `${t("common.notifications")} (${unreadCount > 9 ? "9+" : unreadCount})`
        : t("common.notifications"),
      "/notifications",
      { icon: "bell" }
    ),
    link("portfolio", t("dock.portfolio"), "/portfolio", { icon: "bank" }),
    link("wallet", t("common.wallet"), "/portfolio?tab=currency", { icon: "bank" }),
    link("settings", t("common.settings"), "/settings", { icon: "gear" }),
    ...(!singleplayer
      ? [link("contests", t("common.contests"), "/contests", { icon: "star" })]
      : []),
    link("whatsNew", t("dock.whatsNew"), "/changelog", { icon: "book" }),
  ];
  sheets.more = {
    title: t("dock.everything"),
    header: <div className="mb-1">{search}</div>,
    sections: [
      {
        id: "you",
        title: t("dock.you"),
        menu: {
          title: t("dock.you"),
          overview: link("profile", profileDisplayName || t("common.profile"), "/profile", {
            icon: "star",
          }),
          shortcuts: [],
          groups: [{ id: "you", label: t("common.profile"), items: youLinks }],
        },
      },
      ...(["world", "help", "staff"] as const).flatMap((key) => {
        const menu = menus[key];
        return menu ? [{ id: key, title: menu.title, menu }] : [];
      }),
    ],
  };
  return { tabs, sheets };
}
