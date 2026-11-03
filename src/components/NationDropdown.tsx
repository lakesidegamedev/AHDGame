"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { type CountryId } from "@/lib/constants/countriesCore";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { CountryFlag } from "@/components/CountryFlag";
import { DROPDOWN_PANEL_CLASS } from "@/components/navbar/dropdownStyles";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";

const NationDropdownPanel = dynamic(
  () => import("./NationDropdownPanel").then((m) => m.NationDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={8} /> }
);

const preloadPanel = () => import("./NationDropdownPanel");

interface NationDropdownProps {
  currentParty?: { id: string; name: string; countryId: string } | null;
  /** Viewer's own cabinet seat (any country) - drives the "Cabinet Office" entry. */
  cabinetOffice?: { positionId: string; positionName: string; countryCode: string } | null;
  /** Viewer's own Supreme Court seat - drives the "Justice Office" entry. */
  justiceOffice?: { countryCode: string; seatNumber: number } | null;
  activePresidentElectionId?: string;
  activePresidentElectionSeatId?: string;
  isUKContext?: boolean;
  countryId: CountryId;
  userCountry: CountryId;
  /** Adds the (country-scoped) Unions link to the Economy nav group. */
  unionsEnabled?: boolean;
}

export function NationDropdown(props: NationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNationPicker, setShowNationPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const countryName = useCountryDisplayName();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNationPicker) setShowNationPicker(false);
        else setIsOpen(false);
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
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <CountryFlag country={props.countryId} size="md" className="mr-1" />{" "}
        {countryName(props.countryId)}
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
          className={`absolute right-0 z-50 mt-2 w-56 rounded-xl border border-card-border bg-card shadow-modal ${DROPDOWN_PANEL_CLASS}`}
        >
          <NationDropdownPanel
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
