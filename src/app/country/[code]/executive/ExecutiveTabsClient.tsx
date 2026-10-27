"use client";

import { useTranslations } from "next-intl";
import { WestminsterDevolutionTab } from "./components/WestminsterDevolutionTab";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { WhiteHouseAddressTab } from "@/app/whitehouse/WhiteHouseAddressTab";
import { WhiteHouseOrdersTab } from "@/app/whitehouse/WhiteHouseOrdersTab";
import { WhiteHouseEndorsementsTab } from "@/app/whitehouse/WhiteHouseEndorsementsTab";
import { RegimeHealthTab } from "./RegimeHealthTab";
import { AdminRegimePanel } from "@/app/admin/country/[code]/regime/AdminRegimePanel";
import { AdminAppointPmButton } from "./components/AdminAppointPmModal";
import { type CountryId, type GovernmentType } from "@/lib/constants/countriesCore";
import { ExecutiveActivitySection } from "./components/ExecutiveActivitySection";
import { ForeignAffairsTab } from "./components/ForeignAffairsTab";
import { useConflictsEnabled } from "@/contexts/AuthDataContext";

type TabKey =
  | "devolution"
  | "overview"
  | "address"
  | "orders"
  | "endorsements"
  | "regime"
  | "foreign"
  | "admin";

const TAB_KEYS = [
  "devolution",
  "overview",
  "address",
  "orders",
  "endorsements",
  "regime",
  "foreign",
  "admin",
] as const;

/** Narrows an untrusted `?tab=` value. Anything else falls back to the overview. */
function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TAB_KEYS as readonly string[]).includes(value);
}

interface Props {
  countryId: CountryId;
  /** Server-rendered overview body — the existing executive hub content. */
  overview: ReactNode;
  /** Whether the viewer is the sitting head of government (PM / Chancellor). */
  viewerIsLeader: boolean;
  viewerIsAdmin: boolean;
  /**
   * Whether to show the Regime Health tab — gated on the country being
   * a one-party state at runtime. Computed server-side so a post-Stage-4
   * conversion immediately hides the tab.
   */
  isOnePartyState?: boolean;
  /**
   * Registry copy the server hub already holds: legislature labels and path,
   * the orders-tab label, and the static government type. Passing it in keeps
   * the country registry out of this shell's client bundle.
   */
  chrome: {
    governmentType: GovernmentType;
    executiveTermLimit: number | null;
    /** Whether this country runs the devolved legislature tab. */
    hasDevolution: boolean;
    ordersLabel: string;
    legislatureName: string;
    legislaturePath: string;
  };
}

/**
 * Tab shell for UK / DE / JP executive pages. The hub layout (hero, status
 * strip) wraps this; this owns the tab nav and body switcher. Overview tab
 * body is the pre-existing hub content passed as `overview`. Address and
 * Orders tabs mount the federal components with national scope, visible
 * only to the sitting leader or an admin. The orders tab is labelled per
 * country — "Order in Council" for parliamentary systems.
 */
export function ExecutiveTabsClient({
  countryId,
  overview,
  viewerIsLeader,
  viewerIsAdmin,
  isOnePartyState,
  chrome,
}: Props) {
  const t = useTranslations("nav.devolution");
  const canSeePrivateTabs = viewerIsLeader || viewerIsAdmin;
  const canSeeDevolution = chrome.hasDevolution && canSeePrivateTabs;
  // Seeded from `?tab=`, so a link can open a specific tab. Follows the pattern
  // `CentralBankClient` and `CongressClient` already use. Initial state only: once
  // the page is open, clicking a tab keeps working exactly as before without
  // rewriting the URL.
  //
  // GATED THE SAME WAY THE NAV IS. `active` used to be reachable only by clicking a
  // button the viewer could see, which is why the `address` and `orders` bodies
  // below carry no guard of their own. A URL that could set it directly would route
  // around that, so an unopenable tab falls back to the overview here instead.
  const searchParams = useSearchParams();
  const [active, setActive] = useState<TabKey>(() => {
    const requested = searchParams.get("tab");
    if (!isTabKey(requested)) return "overview";
    if (requested === "devolution") return canSeeDevolution ? requested : "overview";
    const openable =
      requested === "overview" ||
      requested === "endorsements" ||
      (requested === "admin" ? viewerIsAdmin : canSeePrivateTabs);
    return openable ? requested : "overview";
  });
  const conflictsEnabled = useConflictsEnabled();
  const ordersLabel = chrome.ordersLabel;

  return (
    <>
      {/* Scrolls horizontally on a narrow screen. A one-party-state leader with
          conflicts enabled sees seven tabs, and without this the last of them —
          Foreign Affairs and Regime Health — sat off the edge of a phone with no
          way to reach them. */}
      <nav
        className="mb-6 flex min-w-0 overflow-x-auto border-b border-card-border"
        aria-label="Executive sections"
      >
        <TabButton active={active === "overview"} onClick={() => setActive("overview")}>
          Overview
        </TabButton>
        {canSeePrivateTabs && (
          <TabButton active={active === "address"} onClick={() => setActive("address")}>
            Address
          </TabButton>
        )}
        {canSeePrivateTabs && (
          <TabButton active={active === "orders"} onClick={() => setActive("orders")}>
            {ordersLabel}
          </TabButton>
        )}
        {canSeePrivateTabs && (
          <TabButton active={active === "endorsements"} onClick={() => setActive("endorsements")}>
            Endorsements
          </TabButton>
        )}
        {canSeeDevolution && (
          <TabButton active={active === "devolution"} onClick={() => setActive("devolution")}>
            {t("tab")}
          </TabButton>
        )}
        {canSeePrivateTabs && conflictsEnabled && (
          <TabButton active={active === "foreign"} onClick={() => setActive("foreign")}>
            Foreign affairs
          </TabButton>
        )}
        {canSeePrivateTabs && isOnePartyState && (
          <TabButton active={active === "regime"} onClick={() => setActive("regime")}>
            Regime health
          </TabButton>
        )}
        {viewerIsAdmin && (
          <TabButton active={active === "admin"} onClick={() => setActive("admin")} variant="admin">
            Admin
          </TabButton>
        )}
      </nav>
      {active === "overview" && (
        <div className="space-y-8">
          {overview}
          {/* X instruments + acts ledger + cabinet roster (locked composite) —
              rendered below the hub's leadership grid so the page reads
              leadership → instruments → acts + roster, the same macro order as
              the US White House overview. */}
          <ExecutiveActivitySection
            countryId={countryId}
            governmentType={chrome.governmentType}
            executiveTermLimit={chrome.executiveTermLimit}
            cabinetSource="parliamentary"
            ledgerFooter={{
              href: chrome.legislaturePath,
              label: `${chrome.legislatureName} page`,
            }}
          />
        </div>
      )}
      {active === "devolution" && canSeeDevolution && <WestminsterDevolutionTab />}
      {active === "address" && <WhiteHouseAddressTab countryId={countryId} />}
      {active === "orders" && <WhiteHouseOrdersTab countryId={countryId} />}
      {active === "endorsements" && <WhiteHouseEndorsementsTab countryId={countryId} />}
      {/* Guards repeated on the BODY, not just the button: `active` is component
          state, so a flag flipping off while this tab is open would otherwise leave
          it rendered. */}
      {active === "foreign" && canSeePrivateTabs && conflictsEnabled && (
        <ForeignAffairsTab countryId={countryId} canAct={canSeePrivateTabs} />
      )}
      {active === "regime" && isOnePartyState && <RegimeHealthTab countryCode={countryId} />}
      {active === "admin" && viewerIsAdmin && (
        <div data-testid="executive-admin-tab" className="space-y-8">
          <section data-testid="executive-admin-appoint">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-muted">Executive appointment</h2>
              <p className="mt-1 text-xs text-muted">
                Admin override: directly appoint or vacate the head of government, bypassing the
                chamber vote.
              </p>
            </div>
            <AdminAppointPmButton countryId={countryId} />
          </section>
          {isOnePartyState && (
            <div data-testid="executive-admin-regime">
              <AdminRegimePanel countryCode={countryId} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** "admin" colors the tab red to match the StatePageTabs admin convention. */
  variant?: "admin";
}) {
  let className: string;
  if (variant === "admin") {
    className = active
      ? "border-b-2 border-error text-error font-medium"
      : "text-error/70 hover:text-error";
  } else {
    className = active
      ? "border-b-2 border-primary text-foreground font-medium"
      : "text-muted hover:text-foreground";
  }
  return (
    <button
      onClick={onClick}
      // shrink-0 + nowrap so the strip scrolls instead of squeezing the labels
      // into unreadable slivers on a phone.
      className={`shrink-0 whitespace-nowrap px-4 py-3 text-sm transition-colors ${className}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </button>
  );
}
