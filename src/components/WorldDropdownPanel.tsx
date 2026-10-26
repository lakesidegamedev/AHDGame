"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { visibleWorldNavItems, type WorldNavOpts } from "@/components/navbar/worldNavItems";

export interface WorldDropdownPanelProps extends WorldNavOpts {
  isUKContext?: boolean;
  onClose: () => void;
}

export function WorldDropdownPanel({
  isUKContext: _isUKContext = false,
  countryId = "US",
  myCorporationId = null,
  myCorporationHasGroup = false,
  myUnionId = null,
  conflictsEnabled = false,
  unionsEnabled = false,
  settlementCrisisLive = false,
  onClose,
}: WorldDropdownPanelProps) {
  const t = useTranslations("nav");

  const items = visibleWorldNavItems({
    countryId,
    myCorporationId,
    myCorporationHasGroup,
    myUnionId,
    conflictsEnabled,
    unionsEnabled,
    settlementCrisisLive,
  });
  const corporate = items.filter((i) => i.section === "corporate");
  const leaderboard = items.filter((i) => i.section === "leaderboard");
  const main = items.filter((i) => i.section === "main");

  const linkClass =
    "flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60";
  const primaryLinkClass =
    "flex items-center gap-2 px-4 py-2.5 text-sm text-primary transition-colors hover:bg-background/60";

  return (
    <div className="py-1">
      {corporate.length > 0 && (
        <div className="mb-1 border-b border-card-border pb-1">
          <p className="px-4 pt-2 pb-1 text-body-sm font-medium text-muted">
            {t("menus.world.headers.corporate")}
          </p>
          {corporate.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => onClose()}
              className={primaryLinkClass}
              role="menuitem"
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="mb-1 border-b border-card-border pb-1">
          <div className="flex items-center gap-2 px-4 pt-2 pb-1">
            <p className="text-body-sm font-medium text-muted">
              {t("menus.world.headers.leaderboard")}
            </p>
            <span className="rounded-full bg-warning/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-warning">
              Beta
            </span>
          </div>
          {leaderboard.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => onClose()}
              className={linkClass}
              role="menuitem"
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </div>
      )}

      {main.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={() => onClose()}
          className={
            item.parentId != null ? `${linkClass} ml-3 border-l border-card-border pl-3` : linkClass
          }
          role="menuitem"
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </div>
  );
}
