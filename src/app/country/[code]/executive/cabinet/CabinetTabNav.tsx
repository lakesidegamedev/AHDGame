"use client";

import { PILL_SELECTED, PILL_SHAPE, pillClass } from "@/components/ui/selectedState";

export type CabinetTabKey = "overview" | "admin";

/**
 * Overview | Admin tab strip for the cabinet pages. The Admin tab follows the
 * red admin-tab convention (StatePageTabs / ExecutiveTabsClient) and only
 * renders when the viewer is an admin.
 */
export function CabinetTabNav({
  active,
  showAdmin,
  onChange,
}: {
  active: CabinetTabKey;
  showAdmin: boolean;
  onChange: (tab: CabinetTabKey) => void;
}) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-card-border pb-2"
      aria-label="Cabinet sections"
    >
      <button
        onClick={() => onChange("overview")}
        className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-body ${pillClass(active === "overview")}`}
        aria-current={active === "overview" ? "page" : undefined}
      >
        Overview
      </button>
      {showAdmin && (
        <button
          onClick={() => onChange("admin")}
          className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-body ${PILL_SHAPE} ${
            active === "admin" ? PILL_SELECTED : "text-error/70 hover:text-error"
          }`}
          aria-current={active === "admin" ? "page" : undefined}
        >
          Admin
        </button>
      )}
    </nav>
  );
}
