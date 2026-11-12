"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { DROPDOWN_PANEL_CLASS } from "@/components/navbar/dropdownStyles";

interface NavDropdownShellProps {
  label: ReactNode;
  /** Tailwind width class for the open panel, e.g. `w-52`. */
  panelWidthClass: string;
  onPreload: () => void;
  renderPanel: (close: () => void) => ReactNode;
  panelRole?: "menu";
}

/** Desktop navbar trigger button plus its click-outside dropdown panel. */
export function NavDropdownShell({
  label,
  panelWidthClass,
  onPreload,
  renderPanel,
  panelRole,
}: NavDropdownShellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, isOpen, closeDropdown, { closeOnEscape: true });

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onPointerEnter={onPreload}
        onFocus={onPreload}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
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
          role={panelRole}
          className={`absolute right-0 z-50 mt-2 ${panelWidthClass} rounded-xl border border-card-border bg-card shadow-modal ${DROPDOWN_PANEL_CLASS}`}
        >
          {renderPanel(closeDropdown)}
        </div>
      )}
    </div>
  );
}
