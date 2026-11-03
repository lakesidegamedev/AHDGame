"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useTranslations } from "next-intl";
import { DROPDOWN_PANEL_CLASS } from "@/components/navbar/dropdownStyles";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";
export {
  HELP_DISCORD_URL,
  HELP_PATREON_URL,
  HELP_SUPPORTER_WALL_URL,
  HELP_SUPPORT_EMAIL,
  HELP_STATUS_URL,
} from "@/components/navbar/helpLinks";

const HelpDropdownPanel = dynamic(
  () => import("./HelpDropdownPanel").then((m) => m.HelpDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={9} /> }
);

const preloadPanel = () => import("./HelpDropdownPanel");

interface HelpDropdownProps {
  onOpenFeedback?: () => void;
  feedbackCapturing?: boolean;
  wikiDisabled?: boolean;
  isAdminOrMod?: boolean;
}

export function HelpDropdown(props: HelpDropdownProps) {
  const t = useTranslations("nav");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, isOpen, closeDropdown, { closeOnEscape: true });

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onPointerEnter={preloadPanel}
        onFocus={preloadPanel}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {t("common.help")}
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 z-50 mt-2 w-52 rounded-xl border border-card-border bg-card shadow-modal ${DROPDOWN_PANEL_CLASS}`}
        >
          <HelpDropdownPanel {...props} onClose={closeDropdown} />
        </div>
      )}
    </div>
  );
}
