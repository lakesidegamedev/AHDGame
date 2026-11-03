"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useClickOutside } from "@/hooks/useClickOutside";
import { DROPDOWN_PANEL_CLASS } from "./dropdownStyles";
import { isNavActive } from "./experimentalNavPrimitives";
import { buildCampaignNavItems, isCampaignNavActive } from "./campaignNav";

/**
 * The classic navbar's Campaign tab: Actions and the Campaign Manager, in the
 * slot the Actions link held. Keeps the tutorial's `nav-actions` coach mark.
 */
export function CampaignDropdown() {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(ref, isOpen, close, { closeOnEscape: true });
  const active = isCampaignNavActive(pathname);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-coach="nav-actions"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`relative flex items-center gap-1 px-2.5 py-1 text-sm transition-colors hover:text-foreground ${
          active
            ? "font-medium text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-px after:rounded-full after:bg-primary after:opacity-70"
            : "text-muted"
        }`}
      >
        {t("campaignMenu.label")}
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={t("campaignMenu.menuAria")}
          className={`absolute left-0 z-50 mt-2 w-72 rounded-xl border border-card-border bg-card p-1.5 shadow-modal ${DROPDOWN_PANEL_CLASS}`}
        >
          {buildCampaignNavItems(t).map((item) => {
            const current = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                role="menuitem"
                aria-current={current ? "page" : undefined}
                onClick={close}
                className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-white/5 ${
                  current ? "bg-white/5" : ""
                }`}
              >
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className="text-xs leading-snug text-muted">{item.description}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
