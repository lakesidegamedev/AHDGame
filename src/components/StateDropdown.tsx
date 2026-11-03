"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useClickOutside } from "@/hooks/useClickOutside";
import { DROPDOWN_PANEL_CLASS } from "@/components/navbar/dropdownStyles";
import { NavPanelSkeleton } from "@/components/navbar/NavPanelSkeleton";

// The panel body is a separate chunk. The trigger ships with first paint; the
// body is fetched on hover or focus so it is normally in place before the click.
const StateDropdownPanel = dynamic(
  () => import("./StateDropdownPanel").then((m) => m.StateDropdownPanel),
  { ssr: false, loading: () => <NavPanelSkeleton rows={6} /> }
);

const preloadPanel = () => import("./StateDropdownPanel");

interface StateDropdownProps {
  stateId: string;
  stateName: string;
  countryId: string;
  activeElection?: {
    id: string;
    seatId?: string;
    label: string;
  };
  cabinetOffice?: {
    positionId: string;
    positionName: string;
    countryCode: string;
  };
  governorOffice?: {
    stateId: string;
    stateName: string;
    countryCode: string;
  };
  currentParty?: {
    id: string;
    name: string;
  };
}

export function StateDropdown(props: StateDropdownProps) {
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
        aria-label={`${props.stateName} menu`}
      >
        {props.stateName}
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
          <StateDropdownPanel {...props} onClose={closeDropdown} />
        </div>
      )}
    </div>
  );
}
