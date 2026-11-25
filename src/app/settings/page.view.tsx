"use client";
import type { ReactNode } from "react";
import type { SettingsPageContentViewContext } from "./page";

import Link from "next/link";

import { Search, X } from "lucide-react";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { ProfileHeaderImageUpload } from "@/components/ProfileHeaderImageUpload";

import { SectionIcon, MessageBanner } from "./components/shared";

import { RecommendationsBlurb } from "./components/RecommendationsBlurb";
import {
  ADVANCED_SECTION_IDS,
  CONTROL_PANEL_BUCKETS,
  bucketQuickSettingsMatch,
  sectionMatchesQuery,
} from "./components/controlPanelConfig";

export function renderSettingsPageContentView(context: SettingsPageContentViewContext): ReactNode {
  const {
    BucketIcon,
    activeDefinition,
    activeSection,
    availableSections,
    bucketSearchText,
    effectiveCharacter,
    goToOverview,
    handleSwitchCharacterType,
    hasImperialCharacter,
    hasSearchResults,
    hasVisibleCharacterSettings,
    isImperial,
    isLoading,
    normalizedSearch,
    oauthBanner,
    rawUser,
    recommendations,
    renderBucketQuickSettings,
    renderSectionCards,
    renderSectionContent,
    router,
    searchQuery,
    sectionSearchText,
    selectSection,
    setCharacter,
    setOauthBannerDismissed,
    setSearchQuery,
    t,
    userData,
  } = context;

  return (
    <div className="min-h-screen bg-background" data-replay-block>
      <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-7 md:px-6 md:py-10 lg:px-8">
        {/* OAuth result banner */}
        {oauthBanner && (
          <div className="mb-6">
            <MessageBanner
              ok={oauthBanner.ok}
              text={t(oauthBanner.key)}
              onDismiss={() => {
                setOauthBannerDismissed(true);
                router.replace("/settings", { scroll: false });
              }}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-muted">{t("common.loading")}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="mb-6 md:mb-8">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <p className="mb-2 text-body-sm font-medium text-primary">A House Divided</p>
                  <h1 className="text-display font-bold tracking-tight text-foreground md:text-display">
                    {t("page.title")}
                  </h1>
                  <p className="mt-2 max-w-2xl text-body leading-6 text-muted md:text-body-lg">
                    {t("page.subtitle")}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1.5 text-body-sm text-muted">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  {t("page.savesInline")}
                </div>
              </div>
            </header>

            <div className="sticky top-16 z-30 mb-7 rounded-2xl border border-card-border bg-card/95 p-2 shadow-lg backdrop-blur-xl md:top-20 md:p-3">
              <label className="relative block">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder={t("page.searchPlaceholder")}
                  aria-label={t("page.searchAria")}
                  className="min-h-12 w-full rounded-xl border border-card-border bg-background pl-10 pr-11 text-body text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label={t("page.clearSearchAria")}
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-card-elevated hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
            </div>

            <div className="grid gap-7 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-9">
              <nav
                aria-label={t("page.categoriesAria")}
                className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-40 lg:block lg:self-start lg:overflow-visible lg:pb-0"
              >
                {CONTROL_PANEL_BUCKETS.map((bucket) => (
                  <a
                    key={bucket.id}
                    href={`#settings-${bucket.id}`}
                    onClick={() => setSearchQuery("")}
                    className="group flex min-h-11 shrink-0 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-body font-medium text-muted transition-colors hover:border-card-border hover:bg-card hover:text-foreground lg:mb-1 lg:w-full"
                  >
                    <span className="text-primary">
                      <BucketIcon id={bucket.id} />
                    </span>
                    {t(bucket.labelKey)}
                  </a>
                ))}
              </nav>

              <div className="min-w-0 space-y-7">
                {!hasSearchResults && (
                  <div className="rounded-2xl border border-dashed border-card-border bg-card px-6 py-12 text-center">
                    <Search className="mx-auto h-6 w-6 text-muted" />
                    <h2 className="mt-3 text-body-lg font-semibold text-foreground">
                      {t("page.noResultsTitle")}
                    </h2>
                    <p className="mt-1 text-body text-muted">{t("page.noResultsHint")}</p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="mt-4 min-h-11 rounded-xl bg-primary px-4 py-2 text-body font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      {t("page.clearSearch")}
                    </button>
                  </div>
                )}

                {CONTROL_PANEL_BUCKETS.map((bucket) => {
                  const matchingSections = availableSections.filter(
                    (section) =>
                      bucket.sectionIds.includes(section.id) &&
                      sectionMatchesQuery(section, normalizedSearch, sectionSearchText(section))
                  );
                  const quickMatches = bucketQuickSettingsMatch(
                    bucket,
                    normalizedSearch,
                    bucketSearchText(bucket)
                  );
                  if (matchingSections.length === 0 && !quickMatches) return null;

                  const primarySections = matchingSections.filter(
                    (section) => !ADVANCED_SECTION_IDS.has(section.id)
                  );
                  const advancedSections = matchingSections.filter((section) =>
                    ADVANCED_SECTION_IDS.has(section.id)
                  );
                  const showProfileMedia =
                    bucket.id === "game" &&
                    !!effectiveCharacter &&
                    (!normalizedSearch ||
                      "profile avatar photo header image recommendations".includes(
                        normalizedSearch
                      ));
                  const bucketContainsActive =
                    !!activeDefinition && bucket.sectionIds.includes(activeDefinition.id);

                  return (
                    <section
                      key={bucket.id}
                      id={`settings-${bucket.id}`}
                      className="scroll-mt-40 overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm"
                    >
                      <div className="border-b border-card-border bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-5 py-5 md:px-7">
                        <div className="flex items-start gap-4">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                            <BucketIcon id={bucket.id} />
                          </span>
                          <div>
                            <p className="text-body-sm font-medium text-muted">
                              {t(bucket.eyebrowKey)}
                            </p>
                            <h2 className="mt-0.5 text-heading font-bold tracking-tight text-foreground">
                              {t(bucket.labelKey)}
                            </h2>
                            <p className="mt-1 text-body leading-6 text-muted">
                              {t(bucket.summaryKey)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-5 p-4 md:p-6">
                        {quickMatches && renderBucketQuickSettings(bucket.id)}

                        {showProfileMedia && (
                          <div className="rounded-2xl border border-card-border bg-gradient-to-br from-background/70 to-card-elevated/50 p-4 md:p-5">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-body font-semibold text-foreground">
                                  {t("page.publicProfileMedia")}
                                </p>
                                <p className="mt-0.5 text-body-sm text-muted">
                                  {t("page.publicProfileMediaHint")}
                                </p>
                              </div>
                              {recommendations.length > 0 && (
                                <RecommendationsBlurb
                                  recommendations={recommendations}
                                  onSelectSection={selectSection}
                                />
                              )}
                            </div>
                            <div className="grid items-start gap-5 md:grid-cols-[112px_minmax(0,1fr)]">
                              <div>
                                <ProfilePictureUpload
                                  size="compact"
                                  currentUrl={effectiveCharacter.avatarUrl}
                                  characterName={effectiveCharacter.name}
                                  patreonTier={rawUser?.patreonTier ?? null}
                                  patreonExpiresAt={rawUser?.patreonExpiresAt ?? null}
                                  onSuccess={(url) =>
                                    setCharacter((current) =>
                                      current ? { ...current, avatarUrl: url } : null
                                    )
                                  }
                                />
                                <p className="mt-2 text-center text-body-sm text-muted">
                                  {t("page.portrait")}
                                </p>
                              </div>
                              <div className="min-w-0">
                                <ProfileHeaderImageUpload
                                  variant="compact"
                                  currentUrl={effectiveCharacter.profileHeaderImageUrl}
                                  characterName={effectiveCharacter.name}
                                  onSuccess={(url) =>
                                    setCharacter((current) =>
                                      current ? { ...current, profileHeaderImageUrl: url } : null
                                    )
                                  }
                                />
                                <p className="mt-2 text-body-sm text-muted">
                                  {t("page.profileHeader")}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {bucket.id === "game" &&
                          !hasVisibleCharacterSettings &&
                          (!normalizedSearch ||
                            "character create new".includes(normalizedSearch)) && (
                            <div className="rounded-2xl border border-dashed border-card-border bg-card-muted p-6 text-center">
                              <p className="text-body text-muted">{t("page.noCharacter")}</p>
                              <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <Link
                                  href="/create-character"
                                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                  {t("page.createCharacter")}
                                </Link>
                                {userData?.isAdmin && (
                                  <Link
                                    href="/create-imperial-character"
                                    className="inline-flex min-h-11 items-center rounded-xl border border-card-border bg-background px-5 py-2.5 text-body font-medium text-primary transition-colors hover:border-primary/40 hover:bg-card-elevated"
                                  >
                                    {t("page.createImperialCharacter")}
                                  </Link>
                                )}
                              </div>
                            </div>
                          )}

                        {primarySections.length > 0 && renderSectionCards(primarySections)}

                        {advancedSections.length > 0 && (
                          <div className="rounded-2xl border border-card-border bg-card-muted/50 p-4">
                            <div className="mb-3">
                              <p className="text-body-sm font-medium text-muted">
                                {t("page.advancedTitle")}
                              </p>
                              <p className="mt-1 text-body-sm text-muted">
                                {t("page.advancedHint")}
                              </p>
                            </div>
                            {renderSectionCards(advancedSections)}
                          </div>
                        )}

                        {bucket.id === "game" &&
                          hasVisibleCharacterSettings &&
                          !normalizedSearch && (
                            <div className="flex flex-wrap gap-2 border-t border-card-border pt-4">
                              {hasImperialCharacter && (
                                <button
                                  type="button"
                                  onClick={handleSwitchCharacterType}
                                  className="min-h-11 rounded-xl border border-card-border bg-background px-4 py-2 text-body font-medium text-primary transition-colors hover:border-primary/40 hover:bg-card-elevated"
                                >
                                  {isImperial
                                    ? t("page.switchToRegular")
                                    : t("page.switchToImperial")}
                                </button>
                              )}
                              {userData?.isAdmin && (
                                <>
                                  <Link
                                    href="/create-character"
                                    className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-body font-medium text-primary hover:bg-background"
                                  >
                                    {t("page.createAnotherCharacter")}
                                  </Link>
                                  <Link
                                    href="/create-imperial-character"
                                    className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-body font-medium text-primary/75 hover:bg-background hover:text-primary"
                                  >
                                    {t("page.createImperialCharacterPlus")}
                                  </Link>
                                </>
                              )}
                            </div>
                          )}

                        {bucketContainsActive &&
                          activeSection &&
                          activeDefinition &&
                          (!normalizedSearch ||
                            (activeDefinition &&
                              sectionMatchesQuery(
                                activeDefinition,
                                normalizedSearch,
                                sectionSearchText(activeDefinition)
                              ))) && (
                            <section
                              id={`${activeSection}-panel`}
                              className={`overflow-hidden rounded-2xl border shadow-lg ${
                                activeSection === "danger" || activeSection === "character-danger"
                                  ? "border-error/35 bg-error/[0.04]"
                                  : "border-primary/30 bg-card-muted"
                              }`}
                            >
                              <div className="flex items-center gap-3 border-b border-card-border px-5 py-4 md:px-6">
                                <span
                                  className={
                                    activeSection === "danger" ||
                                    activeSection === "character-danger"
                                      ? "text-error"
                                      : "text-primary"
                                  }
                                >
                                  <SectionIcon id={activeSection} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-body font-semibold text-foreground">
                                    {activeDefinition && t(activeDefinition.labelKey)}
                                  </p>
                                  <p className="text-body-sm text-muted">
                                    {activeDefinition && t(activeDefinition.summaryKey)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={goToOverview}
                                  aria-label={t("page.closePanelAria", {
                                    label: activeDefinition
                                      ? t(activeDefinition.labelKey)
                                      : t("page.title"),
                                  })}
                                  className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-card hover:text-foreground"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="px-5 pb-6 pt-5 md:px-7 md:pb-7">
                                {renderSectionContent(activeSection)}
                              </div>
                            </section>
                          )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            <div className="mt-12">
              <Link
                href="/dashboard"
                className="text-body text-muted hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                {t("page.backToDashboard")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
