"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CountryFlag } from "@/components/CountryFlag";
import { type CountryId } from "@/lib/constants/countriesCore";
import type { DesktopNavMenu } from "./desktopNavModel";
import { buildMobileDock, type DockIconSpec } from "./mobileDockBuilder";
import type { NavTranslator } from "./dockMenus";
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
  onClose: () => void;
  search: ReactNode;
}

function renderIcon(icon: DockIconSpec): ReactNode {
  if (icon.kind === "flag") return <CountryFlag country={icon.country} size="sm" />;
  if (icon.kind === "grid") return <MobileDockGridIcon />;
  return <MobileDockIcon name={icon.name} />;
}

/**
 * Tabs and sheets for the phone dock, from the shared builder in
 * mobileDockBuilder (which GET /api/mobile-dock also uses). This adds the
 * React-only parts: icons, the country switcher and the search field.
 */
export function useMobileDockModel({ enabled, onClose, search, ...input }: MobileDockModelInput): {
  tabs: DockTab[];
  sheets: Partial<Record<DockSheetKey, DockSheet>>;
} {
  const t = useTranslations("nav");
  if (!enabled) return { tabs: [], sheets: {} };

  const spec = buildMobileDock({ ...input, t: t as unknown as NavTranslator });
  const tabs: DockTab[] = spec.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: renderIcon(tab.icon),
    href: tab.href,
    sheet: tab.sheet,
    active: tab.active,
  }));

  const sheets: Partial<Record<DockSheetKey, DockSheet>> = {};
  for (const key of ["state", "nation", "more"] as const) {
    const sheet = spec.sheets[key];
    if (!sheet) continue;
    sheets[key] = {
      title: sheet.title,
      header: sheet.switchCountries ? (
        <div
          role="group"
          aria-label={sheet.switchLabel}
          className="-mx-3 mb-1 flex gap-1.5 overflow-x-auto px-3 pb-1"
        >
          {sheet.switchCountries.map((option) => (
            <Link
              key={option.country}
              href={option.href}
              onClick={onClose}
              aria-current={option.current ? "true" : undefined}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${option.current ? "border-primary/50 bg-primary/10 text-foreground" : "border-card-border text-muted"}`}
            >
              <CountryFlag country={option.country} size="sm" />
              {option.label}
            </Link>
          ))}
        </div>
      ) : key === "more" ? (
        <div className="mb-1">{search}</div>
      ) : undefined,
      sections: sheet.sections.map(({ id, title, menu }) => ({ id, title, menu })),
    };
  }
  return { tabs, sheets };
}
