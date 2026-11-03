"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CountryId } from "@/lib/constants/countriesCore";
import { useCountryDisplayName, useEnabledCountries } from "@/contexts/RegisteredCountriesContext";
import { CountryFlag } from "@/components/CountryFlag";
import { hasSandboxAccess } from "@/lib/sandbox/access";
import { countryUrl } from "@/lib/urls";
import {
  MENU_DIVIDER_CLASS,
  MENU_ICON_CLASS,
  MENU_ROW_BASE_CLASS,
  MENU_ROW_IDLE_CLASS,
  MENU_SECTION_LABEL_CLASS,
} from "@/components/navbar/dropdownStyles";
import { AvatarInitial } from "@/components/navbar/SettingsAvatar";

export interface SettingsDropdownPanelProps {
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
  showNationPicker: boolean;
  onShowNationPicker: (open: boolean) => void;
  onClose: () => void;
}

function getSandboxToggleInfo() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const isSandbox =
    hostname.includes("sandbox") ||
    baseUrl.includes("sandbox") ||
    hostname.includes("staging") ||
    baseUrl.includes("staging");

  const mainSiteUrl = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://ahousedividedgame.com";
  const sandboxUrl = process.env.NEXT_PUBLIC_SANDBOX_URL || "https://sandbox.ahousedividedgame.com";

  return {
    isSandbox,
    url: isSandbox ? mainSiteUrl : sandboxUrl,
  };
}

export function SettingsDropdownPanel({
  user,
  onSignOut,
  pageCountry,
  userCountry,
  showNationPicker,
  onShowNationPicker,
  onClose,
}: SettingsDropdownPanelProps) {
  const t = useTranslations("nav");
  const countryName = useCountryDisplayName();
  const enabledCountries = useEnabledCountries();
  const router = useRouter();

  const canAccessSandbox = hasSandboxAccess({
    isAdmin: user.isAdmin,
    isModerator: user.isModerator,
    patreonTier: user.patreonTier,
    isPatronActive: user.isPatronActive,
    testerAccessEnabled: user.sandboxTesterAccess,
    testerGranted: user.sandboxTesterAccess,
  });
  const showSandboxToggle = !user.singleplayer && canAccessSandbox;
  const { url: sandboxUrl, isSandbox } = getSandboxToggleInfo();

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
              const isCurrent = id === pageCountry;
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
        <>
          <div className="flex items-center gap-2.5 border-b border-card-border/60 px-3.5 py-3">
            <AvatarInitial name={user.username} size="sm" />
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-muted">{t("userMenu.signedInAs")}</p>
              <p className="truncate text-sm font-semibold text-foreground">{user.username}</p>
            </div>
          </div>
          <div className="px-1.5 pb-1.5">
            <p className={MENU_SECTION_LABEL_CLASS}>{t("userMenu.accountSection")}</p>
            <Link
              href="/settings"
              onClick={() => onClose()}
              className={`${MENU_ROW_BASE_CLASS} ${MENU_ROW_IDLE_CLASS}`}
            >
              <svg
                className={MENU_ICON_CLASS}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {t("userMenu.profileSettings")}
            </Link>

            <p className={MENU_SECTION_LABEL_CLASS}>{t("userMenu.viewSection")}</p>
            <button
              onClick={() => onShowNationPicker(true)}
              className={`${MENU_ROW_BASE_CLASS} ${MENU_ROW_IDLE_CLASS} cursor-pointer`}
            >
              <svg
                className={MENU_ICON_CLASS}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {t("countrySwitcher.switchNationView")}
            </button>

            {showSandboxToggle && (
              <a
                href={sandboxUrl}
                target="_self"
                className={`${MENU_ROW_BASE_CLASS} ${MENU_ROW_IDLE_CLASS}`}
              >
                <svg
                  className={MENU_ICON_CLASS}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                {isSandbox ? t("userMenu.switchToMainSite") : t("userMenu.switchToSandbox")}
              </a>
            )}

            {!user.singleplayer && (
              <>
                <div className={MENU_DIVIDER_CLASS} />
                <button
                  onClick={() => {
                    onClose();
                    onSignOut();
                  }}
                  className={`${MENU_ROW_BASE_CLASS} cursor-pointer text-error hover:bg-background/60`}
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  {t("common.signOut")}
                </button>
              </>
            )}

            <div className={MENU_DIVIDER_CLASS} />
            <Link
              href="/changelog"
              onClick={() => onClose()}
              className="block rounded-lg px-2.5 py-1.5 text-center text-xs text-muted/70 hover:text-foreground transition-colors"
            >
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"} ·{" "}
              {process.env.NEXT_PUBLIC_GIT_COMMIT ?? "dev"}
            </Link>
          </div>
        </>
      )}
    </>
  );
}
