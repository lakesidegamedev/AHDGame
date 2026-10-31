"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { type CountryId } from "@/lib/constants/countriesCore";
import { DROPDOWN_PANEL_CLASS } from "@/components/navbar/dropdownStyles";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";
import { AvatarInitial } from "@/components/navbar/SettingsAvatar";

const SettingsDropdownPanel = dynamic(
  () => import("./SettingsDropdownPanel").then((m) => m.SettingsDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={7} /> }
);

const preloadPanel = () => import("./SettingsDropdownPanel");

interface SettingsDropdownProps {
  user: {
    username: string;
    isAdmin?: boolean;
    isModerator?: boolean;
    singleplayer?: boolean;
    patreonTier?: string | null;
    isPatronActive?: boolean;
    sandboxTesterAccess?: boolean;
  };
  onSignOut: () => void;
  pageCountry: CountryId;
  userCountry: CountryId;
}

export function SettingsDropdown(props: SettingsDropdownProps) {
  const t = useTranslations("nav");
  const [isOpen, setIsOpen] = useState(false);
  const [showNationPicker, setShowNationPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowNationPicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNationPicker) {
          setShowNationPicker(false);
        } else {
          setIsOpen(false);
        }
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, showNationPicker]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onPointerEnter={preloadPanel}
        onFocus={preloadPanel}
        className="flex items-center justify-center rounded-full transition-transform active:scale-95"
        aria-label={t("common.userMenu")}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <AvatarInitial name={props.user.username} highlighted={isOpen} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-card-border bg-card shadow-modal ${DROPDOWN_PANEL_CLASS}`}
        >
          <SettingsDropdownPanel
            {...props}
            showNationPicker={showNationPicker}
            onShowNationPicker={setShowNationPicker}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
