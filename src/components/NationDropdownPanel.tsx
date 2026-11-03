"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type CountryId } from "@/lib/constants/countriesCore";
import { useEnabledCountries, useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { CountryFlag } from "@/components/CountryFlag";
import { useActiveCharters } from "@/hooks/useActiveCharters";
import { useActiveReferendumCampaign } from "@/hooks/useActiveReferendumCampaign";
import { useActivePresidentElection } from "@/hooks/useActivePresidentElection";
import { countryUrl, cabinetOfficeUrl, partyUrl, scotusJusticeOfficeUrl } from "@/lib/urls";
import { buildNationalDetailsSections } from "@/components/navbar/nationDetailsSections";
import { CollapsibleNavSection } from "@/components/navbar/CollapsibleNavSection";
import { NATION_DETAIL_ICONS } from "@/components/navbar/nationDetailIcons";

export interface NationDropdownPanelProps {
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
  showNationPicker: boolean;
  onShowNationPicker: (open: boolean) => void;
  onClose: () => void;
}

export function NationDropdownPanel({
  currentParty,
  cabinetOffice,
  justiceOffice,
  activePresidentElectionId: _activePresidentElectionId,
  activePresidentElectionSeatId: _activePresidentElectionSeatId,
  isUKContext: _isUKContext = false,
  countryId = "US",
  userCountry = "US",
  unionsEnabled = false,
  showNationPicker,
  onShowNationPicker,
  onClose,
}: NationDropdownPanelProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const enabledCountries = useEnabledCountries();
  const countryName = useCountryDisplayName();
  // Charter entry visibility: the dropdown link to /charters is gated on
  // whether the viewer has an active founder slot. The hook returns
  // `null` until fetched, `[]` if none active, and a non-empty list
  // otherwise - see `useActiveCharters`. Mobile menu uses the same hook
  // so the gating stays in sync across breakpoints. The panel mounts only
  // when the menu is open, so it fetches on open.
  const activeCharters = useActiveCharters(true);
  // Referendums link: gated on a live campaign in the viewed country, fetched
  // only when the dropdown opens (same on-demand pattern as charters).
  const hasActiveReferendumCampaign = useActiveReferendumCampaign(countryId, true);
  // Presidential-election quick-link must reflect the VIEWED country, not the
  // global US race client-nav ships. Fetch per-country on open (same on-demand
  // pattern as charters/referendums).
  const activePresidentElection = useActivePresidentElection(countryId, true);
  const currentPartyCountry = currentParty?.countryId ?? countryId;

  // Resolve the charter entry (active founders only) for the Politics sub-section.
  const charterEntry =
    activeCharters && activeCharters.length > 0
      ? {
          href: activeCharters.length === 1 ? `/charters/${activeCharters[0]!.id}` : "/charters",
          label:
            activeCharters.length === 1
              ? t("menus.nation.charterSingle", { name: activeCharters[0]!.proposedName })
              : t("menus.nation.chartersMultiple", { count: activeCharters.length }),
        }
      : null;

  const sections = buildNationalDetailsSections(countryId, {
    activePresidentElection,
    charters: charterEntry,
    hasActiveReferendumCampaign,
    unionsEnabled,
  });

  return (
    <>
      {showNationPicker ? (
        <>
          <div className="flex items-center gap-2 border-b border-card-border/60 px-3 py-2.5">
            <button
              onClick={() => onShowNationPicker(false)}
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t("common.back")}
            </button>
            <p className="text-body-sm font-medium text-muted">
              {t("countrySwitcher.selectNation")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {enabledCountries.map((id) => {
              const isHome = id === userCountry;
              const isCurrent = id === countryId;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onClose();
                    onShowNationPicker(false);
                    router.push(countryUrl(id));
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition-colors hover:bg-background/60 ${
                    isCurrent ? "ring-1 ring-primary/60 bg-primary/10" : ""
                  }`}
                >
                  <CountryFlag country={id} size="lg" />
                  <span className="text-xs leading-tight text-foreground truncate w-full">
                    {countryName(id)}
                  </span>
                  {isHome && (
                    <span className="text-[10px] text-muted leading-none">
                      {t("countrySwitcher.homeBadge")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="py-1">
          {/* Home Nation section */}
          <div className="mb-1 border-b border-card-border pb-1">
            <p className="px-4 pt-2 pb-1 text-body-sm font-medium text-muted">
              {t("menus.nation.homeNation")}
            </p>
            <Link
              href={countryUrl(userCountry)}
              onClick={() => onClose()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
            >
              <CountryFlag country={userCountry} size="sm" />
              <span>{countryName(userCountry)}</span>
              <span className="ml-1 text-xs text-muted">{t("menus.nation.homeSuffix")}</span>
            </Link>
            {cabinetOffice && (
              <Link
                href={cabinetOfficeUrl(cabinetOffice.countryCode, cabinetOffice.positionId)}
                onClick={() => onClose()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
              >
                <svg
                  className="h-4 w-4 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <span className="truncate">{t("menus.nation.cabinetOffice")}</span>
              </Link>
            )}
            {justiceOffice && (
              <Link
                href={scotusJusticeOfficeUrl(justiceOffice.countryCode)}
                onClick={() => onClose()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
              >
                <svg
                  className="h-4 w-4 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v18m-7-4h14M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zm10 0l-3 6a3 3 0 006 0l-3-6z"
                  />
                </svg>
                <span className="truncate">{t("menus.nation.justiceOffice")}</span>
              </Link>
            )}
            {currentParty && (
              <Link
                href={partyUrl(currentPartyCountry, currentParty.id)}
                onClick={() => onClose()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
              >
                <svg
                  className="h-4 w-4 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 21v-8a2 2 0 012-2h14a2 2 0 012 2v8M9 10a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <span className="truncate">
                  {t("menus.nation.myParty")} - {currentParty.name}
                </span>
              </Link>
            )}
            {userCountry === "US" && (
              <Link
                href="/political-operations"
                onClick={() => onClose()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
              >
                <svg
                  className="h-4 w-4 text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                <span className="truncate">{t("menus.nation.myPoliticalOperations")}</span>
              </Link>
            )}
          </div>

          {/* National Details - grouped sub-sections (Government / Politics / Economy / Other). */}
          <p className="px-4 pt-2 pb-1 text-body-sm font-medium text-muted">
            {t("menus.nation.nationalDetailsFor", {
              country: countryName(countryId),
            })}
          </p>
          {sections.map((section) => (
            <CollapsibleNavSection
              key={section.title}
              title={t(section.titleKey)}
              collapsible={section.collapsible}
              labelClassName="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted/80"
            >
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => onClose()}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-background/60"
                >
                  {NATION_DETAIL_ICONS[item.id]}
                  <span className="truncate">{item.labelKey ? t(item.labelKey) : item.label}</span>
                </Link>
              ))}
            </CollapsibleNavSection>
          ))}

          <button
            onClick={() => onShowNationPicker(true)}
            className="flex w-full items-center gap-2 border-t border-card-border px-4 py-2.5 text-sm text-muted transition-colors hover:bg-background/60 hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {t("countrySwitcher.switchNationView")}
          </button>
        </div>
      )}
    </>
  );
}
