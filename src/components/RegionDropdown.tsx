"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useClickOutside } from "@/hooks/useClickOutside";
import { type CountryId } from "@/lib/constants/countriesCore";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";

const RegionDropdownPanel = dynamic(
  () => import("./RegionDropdownPanel").then((m) => m.RegionDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={6} /> }
);

const preloadPanel = () => import("./RegionDropdownPanel");

interface RegionDropdownProps {
  regionId: string;
  regionName: string;
  /** Country of the region being displayed (URL routing). */
  regionCountryId: CountryId;
  /** UK only - the devolved-nation grouping (ENG/SCO/WAL/NI). Ignored for other countries. */
  nationId?: string;
  currentParty?: {
    id: string;
    name: string;
    countryId: string;
  } | null;
}

export function RegionDropdown(props: RegionDropdownProps) {
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
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${props.regionName} menu`}
      >
        {props.regionName}
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
        <div className="absolute right-0 z-50 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-card-border bg-card shadow-modal max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden">
          <RegionDropdownPanel {...props} onClose={closeDropdown} />
        </div>
      )}
    </div>
  );
}
