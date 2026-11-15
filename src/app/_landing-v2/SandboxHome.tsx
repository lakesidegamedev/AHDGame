"use client";

/**
 * Full-bleed, globe-behind-a-drawer landing design.
 *
 * Design intent:
 *   - Globe is `fixed inset-0 z-0` — always in the background viewport layer,
 *     unaffected by parent overflow constraints that break `sticky`.
 *   - A first-viewport hero div (transparent, h-100svh) overlays the globe.
 *     It is `pointer-events-none` so drag/zoom fall through to the fixed globe.
 *   - The opaque drawer below slides up over the globe as the user scrolls,
 *     covering it once the drawer fills the viewport.
 *   - The real game Navbar (from NavbarWrapper in layout.tsx) renders on top
 *     at z-50; the globe and hero sit behind it.
 */
import dynamic from "next/dynamic";
import { LandingIntakeBeacon } from "@/components/intake/LandingIntakeBeacon";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CDN_WORLD_GEO_URL } from "@/lib/images/cdnUrls";
import {
  LANDING_TEXT_LINK_CLASS,
  LandingSectionHeading,
} from "@/components/landing/LandingSectionHeading";
import { getEraConfig } from "@/components/landing/eraThemes";
import { globePosterBase } from "@/components/landing/globePosters";
import { getEraFlavorCards } from "@/components/landing/flavorCards";
import {
  battlegroundFeatureIdsForEra,
  economicPowerFeatureIdsForEra,
} from "@/components/landing/countryTierRosters";
import { resolveEraCopy } from "@/lib/marketing/eraCopy";
import type { MarketedWorld } from "@/lib/marketing/marketedWorld";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { CrtCountdown, useCrtCountdown } from "./CrtCountdown";
import { BroadcastBackdrop, BroadcastHeadline, BroadcastTierKey } from "./BroadcastHero";
import { EraExplainerLink } from "./EraExplainerLink";
import { GlobePoster } from "./GlobePoster";
import { useGlobeActivation } from "./useGlobeActivation";
import { LaunchCountdown } from "./LaunchCountdown";
import type { LaunchSchedule } from "@/lib/landing/rules/launchSchedule";
import { LANDING_FOOTER_SECTIONS, LANDING_TRAY_LINKS } from "./publicLinks";
import type { GovernmentType } from "@/lib/constants/countriesCore";
import type { EraNation, EraTileKey } from "@/components/landing/eraThemes";
import type { DiscordInviteStats } from "@/lib/discord/inviteStats";

export type LandingCrisis = {
  _id: string;
  name: string;
  description: string;
  heroImage?: string;
  scope: "global" | "country" | "region";
  countryIds: string[];
};

// d3-geo relies on browser APIs; skip server render.
const LandingGlobe = dynamic(
  () => import("@/components/LandingGlobe").then((m) => m.LandingGlobe),
  {
    ssr: false,
    loading: () => <div className="h-full w-full" />,
  }
);

// Below-the-fold, client-only: split out of the initial hero bundle.
const FlavorCardCarousel = dynamic(() =>
  import("@/components/landing/FlavorCardCarousel").then((m) => m.FlavorCardCarousel)
);
const CommunitySupportSection = dynamic(() =>
  import("@/components/landing/CommunitySupportSection").then((m) => m.CommunitySupportSection)
);

/* -------------------------------------------------------------------------- */
/* Shared styles + links                                                       */
/* -------------------------------------------------------------------------- */

type BlocId = "western" | "eastern";
type TFunc = ReturnType<typeof useTranslations>;

const blocMeta = (t: TFunc): Record<BlocId, { label: string }> => ({
  western: { label: t("landing.blocs.western") },
  eastern: { label: t("landing.blocs.eastern") },
});

/** Playability is a plain word after each nation; the primary grouping is bloc. */
const tierLabel = (t: TFunc): Record<EraNation["tier"], { label: string; title: string }> => ({
  player: {
    label: t("landing.tiers.playable"),
    title: t("landing.tiers.playableTitle"),
  },
  econ: {
    label: t("landing.tiers.economy"),
    title: t("landing.tiers.economyTitle"),
  },
  npp: {
    label: t("landing.tiers.computerRun"),
    title: t("landing.tiers.computerRunTitle"),
  },
  background: {
    label: t("landing.tiers.background"),
    title: t("landing.tiers.backgroundTitle"),
  },
});

/** Group headings when the roster is grouped by tier. */
const TIER_GROUPS: readonly EraNation["tier"][] = ["player", "econ", "npp", "background"];
const tierGroupLabel = (t: TFunc): Record<EraNation["tier"], string> => ({
  player: t("landing.tierGroups.player"),
  econ: t("landing.tierGroups.econ"),
  npp: t("landing.tierGroups.npp"),
  background: t("landing.tierGroups.background"),
});

/** Only one-party/command systems land in Eastern Bloc — never default unknowns there. */
function isEasternBloc(governmentType: GovernmentType | undefined): boolean {
  return governmentType === "onePartyState";
}

const PRIMARY_BUTTON_CLASSES =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4.5 h-11 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-dark active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const SECONDARY_BUTTON_CLASSES =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-card-border bg-card px-4.5 h-11 text-sm font-medium text-foreground transition-all duration-150 hover:border-muted/40 active:scale-[0.98]";

const GHOST_BUTTON_CLASSES =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-4.5 h-11 text-sm font-medium text-muted transition-all duration-150 hover:text-foreground active:scale-[0.98]";

/** Public sideload mirror for the Android beta build;  */
const ANDROID_BETA_APK_URL = "https://ops.lakesidegames.net/downloads/a-house-divided-0.3.1.apk";

/** Opening view for an era that does not choose its own: the Mediterranean. */
const GLOBE_ROTATION: [number, number, number] = [48, -30, 0];

function links(isSignedIn: boolean) {
  return {
    primary: isSignedIn ? "/dashboard" : "/register",
    secondary: "/world",
    closing: isSignedIn ? "/dashboard" : "/register",
    tiles: {
      stateMetrics: isSignedIn ? "/dashboard" : "/login",
      ballot: isSignedIn ? "/elections" : "/login",
      bills: isSignedIn ? "/legislation" : "/login",
      industrial: isSignedIn ? "/sectors" : "/login",
      markets: isSignedIn ? "/stockmarket/global" : "/login",
      newsroom: isSignedIn ? "/news" : "/login",
      centralBanks: isSignedIn ? "/world" : "/login",
    },
  };
}

const footerNav = (t: TFunc) =>
  LANDING_FOOTER_SECTIONS.map((section) => ({
    headingKey: section.headingKey,
    heading: t(section.headingKey),
    links: section.links.map((link) => ({
      href: link.href,
      label: t(link.labelKey),
      external: link.external ?? false,
    })),
  }));

const trayNav = (t: TFunc) =>
  LANDING_TRAY_LINKS.map((link) => ({
    href: link.href,
    label: t(link.labelKey),
    external: link.external ?? false,
  }));

/**
 * next/link for in-app routes, a plain anchor for anything off-domain. The
 * arrow is the only signal a visitor gets that a link leaves the site, so
 * external entries must not render as a bare internal link.
 */
function LandingNavLink({
  href,
  label,
  external,
  className,
}: {
  href: string;
  label: string;
  external: boolean;
  className: string;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
        <span aria-hidden="true" className="ml-1">
          ↗
        </span>
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

const learnLinks = (t: TFunc) =>
  [
    {
      href: "/guides",
      title: t("landing.learnLinks.guidesTitle"),
      body: t("landing.learnLinks.guidesBody"),
      cta: t("landing.learnLinks.guidesCta"),
    },
    {
      href: "/wiki",
      title: t("landing.learnLinks.wikiTitle"),
      body: t("landing.learnLinks.wikiBody"),
      cta: t("landing.learnLinks.wikiCta"),
    },
    {
      href: "/news",
      title: t("landing.learnLinks.newsTitle"),
      body: t("landing.learnLinks.newsBody"),
      cta: t("landing.learnLinks.newsCta"),
    },
    {
      href: "/faq",
      title: t("landing.learnLinks.faqTitle"),
      body: t("landing.learnLinks.faqBody"),
      cta: t("landing.learnLinks.faqCta"),
    },
  ] as const;

/**
 * Era-neutral tile copy. Eras fall back to these when they don't override,
 * so a preset can't inherit another decade's politics by accident.
 */
const defaultTileBodies = (t: TFunc): Record<EraTileKey, string> => ({
  stateMetrics: t("landing.tiles.stateMetricsBody"),
  ballot: t("landing.tiles.ballotBody"),
  bills: t("landing.tiles.billsBody"),
  industrial: t("landing.tiles.industrialBody"),
  markets: t("landing.tiles.marketsBody"),
  newsroom: t("landing.tiles.newsroomBody"),
  centralBanks: t("landing.tiles.centralBanksBody"),
});

/**
 * One entry in a landing list: a title, a one-line description and a link
 * label, set as type with no box. The whole entry is the link target.
 */
function LandingListItem({
  title,
  body,
  href,
  linkLabel,
}: {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <li>
      <Link href={href} className="group block">
        <h3 className="text-body-lg font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">
          {title}
        </h3>
        <p className="mt-1 text-body leading-relaxed text-muted">{body}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-body-sm font-medium text-foreground">
          {linkLabel}
          <span aria-hidden="true">→</span>
        </span>
      </Link>
    </li>
  );
}

export function SandboxHome({
  isSignedIn,
  era = "1979",
  crises = [],
  playerCounts = {},
  governmentTypes = {},
  discordStats = null,
  world,
  backgroundMacroFeatureIds,
  currentYear,
  launch,
  renderedAt,
}: {
  isSignedIn: boolean;
  era?: string | number;
  crises?: LandingCrisis[];
  playerCounts?: Record<string, number>;
  /** Live-or-static governmentType per country id (from countryState + COUNTRY_CONFIGS). */
  governmentTypes?: Record<string, GovernmentType>;
  /** Server-fetched Discord member/online counts for the community section. */
  discordStats?: DiscordInviteStats | null;
  /**
   * Live version and playable roster. Every number and country name in the
   * hero copy comes from here rather than from a literal, because the promo
   * pill advertised v1.0.0 for six releases after 1.0.0 shipped.
   */
  world: MarketedWorld;
  /**
   * Background Nations the era's preset simulates as macro aggregates. Read
   * from the world entity manifest on the server, so the manifest stays out of
   * this bundle. The globe draws them apart from unsimulated grey.
   */
  backgroundMacroFeatureIds?: readonly string[];
  /** The world's in-game year now. The broadcast headline rolls up to it. */
  currentYear?: number;
  /** Doors open and first turn, resolved on the server. Absent once the world is running. */
  launch?: LaunchSchedule | null;
  /** When the server rendered this page (ISO). Picks the globe poster closest to the real sun. */
  renderedAt: string;
}) {
  const t = useTranslations("auth");
  const eraConfig = getEraConfig(era);
  const [hoveredBloc, setHoveredBloc] = useState<string | null>(null);
  // Non-null only while the promo countdown is still running.
  const countdown = useCrtCountdown();
  const globeBoxRef = useRef<HTMLDivElement>(null);
  const posterBase = globePosterBase(eraConfig.id, new Date(renderedAt));
  const globeReady = useGlobeActivation(globeBoxRef, posterBase !== null);
  const [globeDrawn, setGlobeDrawn] = useState(false);
  const markGlobeDrawn = useCallback(() => setGlobeDrawn(true), []);
  const l = links(isSignedIn);

  const countriesByBloc = useMemo(() => {
    const western: EraNation[] = [];
    const eastern: EraNation[] = [];
    for (const nation of eraConfig.nations) {
      if (isEasternBloc(governmentTypes[nation.id])) {
        eastern.push(nation);
      } else {
        western.push(nation);
      }
    }
    return { western, eastern };
  }, [eraConfig, governmentTypes]);

  const visibleBlocs = useMemo(
    () => (["western", "eastern"] as BlocId[]).filter((bloc) => countriesByBloc[bloc].length > 0),
    [countriesByBloc]
  );

  const tileBodies = useMemo(() => defaultTileBodies(t), [t]);
  const tileBody = (key: EraTileKey): string => eraConfig.tileBodies?.[key] ?? tileBodies[key];
  const bloc = useMemo(() => blocMeta(t), [t]);
  const tier = useMemo(() => tierLabel(t), [t]);
  const groupLabel = useMemo(() => tierGroupLabel(t), [t]);
  const byTier = eraConfig.rosterGrouping === "tier";
  const rosterGroups = useMemo(
    () =>
      byTier
        ? TIER_GROUPS.map((tierId) => ({
            id: tierId,
            label: groupLabel[tierId],
            countries: eraConfig.nations.filter((nation) => nation.tier === tierId),
          })).filter((group) => group.countries.length > 0)
        : visibleBlocs.map((blocId) => ({
            id: blocId,
            label: bloc[blocId].label,
            countries: countriesByBloc[blocId],
          })),
    [byTier, groupLabel, eraConfig, visibleBlocs, bloc, countriesByBloc]
  );
  const heroLinks = [eraConfig.explainer, eraConfig.newsPost].flatMap((link) =>
    link ? [{ href: link.href, label: link.labelKey ? t(link.labelKey) : link.label }] : []
  );
  const footer = useMemo(() => footerNav(t), [t]);
  const tray = useMemo(() => trayNav(t), [t]);
  const learn = useMemo(() => learnLinks(t), [t]);

  const wireframeColor = eraConfig.wireframeColor ?? undefined;
  // The 1991 satellite-feed hero. Exclusive with the CRT look: no era sets both.
  const broadcast = eraConfig.broadcast;
  // Sphere / conflict / crisis theatres for this era, mirroring the world
  // entity manifest. Stable module-level array, so the globe memoises on it.
  const battlegroundFeatureIds = battlegroundFeatureIdsForEra(eraConfig.id);
  const economicPowerFeatureIds = economicPowerFeatureIdsForEra(eraConfig.id);
  // Czechoslovakia and Yugoslavia drawn over their successors where the era names them.

  return (
    <div className="relative bg-background text-foreground">
      {!isSignedIn && <LandingIntakeBeacon />}
      {/* ── Fixed globe — always in the background viewport layer ──────────── */}
      {/* `fixed` bypasses parent overflow-x-hidden on <main> that breaks sticky. */}
      <div className="fixed inset-0 z-0" aria-hidden="true">
        {wireframeColor && (
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
            }}
          />
        )}
        {wireframeColor && (
          <>
            {/* ── Signal field: phosphor ground glow, star scatter, drifting scan beam ── */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle at 60% 48%, ${wireframeColor}14, transparent 46%)`,
              }}
            />
          </>
        )}
        {broadcast && <BroadcastBackdrop nightside={eraConfig.id === "2027"} />}
        <div
          ref={globeBoxRef}
          className="absolute left-[60%] top-[48%] h-[130vmax] w-[130vmax] -translate-x-1/2 -translate-y-1/2"
          style={
            wireframeColor ? { filter: `drop-shadow(0 0 18px ${wireframeColor}55)` } : undefined
          }
        >
          {posterBase ? <GlobePoster base={posterBase} hidden={globeDrawn} /> : null}
          {globeReady ? (
            <div
              className={`absolute inset-0 transition-opacity duration-500 ${
                posterBase && !globeDrawn ? "opacity-0" : "opacity-100"
              }`}
            >
              <LandingGlobe
                onReady={markGlobeDrawn}
                countryAccess={eraConfig.accessMap}
                geoUrl={CDN_WORLD_GEO_URL}
                initialRotation={eraConfig.initialRotation ?? GLOBE_ROTATION}
                initialZoom={1.05}
                wireframeColor={wireframeColor}
                playerCounts={playerCounts}
                battlegroundFeatureIds={battlegroundFeatureIds}
                economicPowerFeatureIds={economicPowerFeatureIds}
                backgroundMacroFeatureIds={backgroundMacroFeatureIds}
                markersFromSm={Boolean(broadcast)}
              />
            </div>
          ) : null}
        </div>

        {/* Radial vignette fades globe into page background at edges. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(125%_125%_at_68%_42%,transparent_38%,var(--background)_86%)]" />
        {/* Left scrim keeps hero copy legible against the globe. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-background via-background/70 to-transparent sm:w-3/4 lg:w-3/5" />
        {/* Bottom fade blends into the drawer's rounded top. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
      </div>

      {/* ── First-viewport hero — transparent, globe shows through ─────────── */}
      {/* pointer-events-none lets drag/zoom fall through to the fixed globe. */}
      <div
        id="top"
        className={`pointer-events-none relative z-10 flex h-[100svh] min-h-[560px] flex-col justify-center ${
          // Centre the copy in the space above the tier key, not behind it.
          broadcast ? "pb-[calc(12vh+1.5rem)]" : ""
        }`}
      >
        <div className="pointer-events-auto mx-auto w-full max-w-7xl px-5 sm:px-8">
          <div className="max-w-xl">
            <CrtCountdown remaining={countdown} />
            <LaunchCountdown schedule={launch} />
            {broadcast ? (
              <>
                <BroadcastHeadline
                  text={eraConfig.heroHeadline}
                  year={eraConfig.year}
                  currentYear={currentYear}
                />
                <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-[1.0625rem]">
                  {eraConfig.heroDek}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-display font-bold leading-tight tracking-tight text-foreground">
                  {eraConfig.heroHeadline}
                </h1>
                <p className="mt-5 max-w-lg text-body-lg leading-relaxed text-muted">
                  {eraConfig.heroDek}
                </p>
              </>
            )}
            <EraExplainerLink links={heroLinks} tone={broadcast ? "onDark" : "theme"} />
            {/* Three actions, one shape each: create an account, come back to
                one, or look around first. The app download lives in the drawer
                below — it is not a way into the game. */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {isSignedIn ? (
                <Link href={l.primary} className={PRIMARY_BUTTON_CLASSES}>
                  {t("landing.backToDashboard")}
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <>
                  <Link href="/register" className={PRIMARY_BUTTON_CLASSES}>
                    {t("landing.signUp")}
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link href="/login" className={SECONDARY_BUTTON_CLASSES}>
                    {t("landing.signIn")}
                  </Link>
                </>
              )}
              <Link href={l.secondary} className={SECONDARY_BUTTON_CLASSES}>
                {t("landing.explore")}
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1.5">
          <span className="text-body-sm font-medium text-muted">{t("landing.scrollCue")}</span>
          <span className="block h-5 w-[1px] bg-muted/60" aria-hidden />
        </div>

        {/* The tier key sits just above the drawer's 12vh overlap, so it is
            the last thing in the first viewport. */}
        {broadcast && (
          <div className="absolute inset-x-0 bottom-[calc(12vh+1rem)]">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
              <BroadcastTierKey
                hidden={false}
                backgroundIsSimulated={Boolean(backgroundMacroFeatureIds?.length)}
                counts={broadcast.tierCounts}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Drawer — opaque, rises over the fixed globe as you scroll ──────── */}
      <div className="relative z-10 -mt-[12vh] rounded-t-[2rem] border-t border-card-border bg-background shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.45)]">
        {/* Grabber handle */}
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-12 rounded-full bg-muted/40" aria-hidden="true" />
        </div>

        {/* What you can do: the feature list, then the world in the era's year */}
        <section id="play" className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <LandingSectionHeading>{t("landing.hallsOfPower")}</LandingSectionHeading>
          <p className="mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">
            {eraConfig.playSectionDek}
          </p>
          <ul className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            <LandingListItem
              title={t("landing.tiles.stateMetrics")}
              body={tileBody("stateMetrics")}
              href={l.tiles.stateMetrics}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.ballot")}
              body={tileBody("ballot")}
              href={l.tiles.ballot}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.bills")}
              body={tileBody("bills")}
              href={l.tiles.bills}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.industrial")}
              body={tileBody("industrial")}
              href={l.tiles.industrial}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.markets")}
              body={tileBody("markets")}
              href={l.tiles.markets}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.newsroom")}
              body={tileBody("newsroom")}
              href={l.tiles.newsroom}
              linkLabel={t("landing.enter")}
            />
            <LandingListItem
              title={t("landing.tiles.centralBanks")}
              body={tileBody("centralBanks")}
              href={l.tiles.centralBanks}
              linkLabel={t("landing.enter")}
            />
          </ul>

          {/* The nations of the era, by bloc, each with a plain playability word */}
          <div id="world" className="mt-12">
            <h3 className="text-heading font-semibold text-foreground">
              {t("landing.worldInYear", { year: eraConfig.year })}
            </h3>
            <p className="mt-1 max-w-2xl text-body leading-relaxed text-muted">
              {resolveEraCopy(eraConfig.worldSectionDek, world)}
            </p>
            <div
              className={`mt-6 grid gap-x-12 gap-y-8 ${
                byTier ? "lg:grid-cols-[1fr_1fr_2fr]" : "lg:grid-cols-2"
              }`}
            >
              {rosterGroups.map(({ id: groupId, label, countries }) => {
                const isDimmed = hoveredBloc !== null && hoveredBloc !== groupId;
                return (
                  <div
                    key={groupId}
                    className={`transition-opacity duration-200 ${
                      isDimmed ? "opacity-40" : "opacity-100"
                    }`}
                    onMouseEnter={() => setHoveredBloc(groupId)}
                    onMouseLeave={() => setHoveredBloc(null)}
                  >
                    <h4 className="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-foreground">
                      {label}
                      <span className="text-body-sm font-normal text-muted">
                        {t("landing.nationCount", { count: countries.length })}
                      </span>
                    </h4>
                    <ul
                      className={`mt-2 grid gap-x-8 gap-y-1.5 ${
                        byTier && countries.length < 6 ? "" : "sm:grid-cols-2"
                      }`}
                    >
                      {countries.map((c) => {
                        const tierMeta = tier[c.tier];
                        return (
                          <li
                            key={c.id}
                            className="flex items-baseline justify-between gap-3 text-body"
                          >
                            <span
                              className={
                                c.tier === "npp" || c.tier === "background"
                                  ? "text-muted"
                                  : "text-foreground"
                              }
                            >
                              {c.name}
                            </span>
                            {/* Grouped by tier, the heading already says it. */}
                            {!byTier && (
                              <span
                                className="shrink-0 text-body-sm text-muted"
                                title={tierMeta.title}
                              >
                                {tierMeta.label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Flavor cards carousel */}
        <section className="border-t border-card-border">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            {/* The carousel is leaders PLUS whatever crises are live in the
                world right now, so it cannot be headed "Leaders of the era":
                on a world mid-crisis the section promised portraits and
                delivered freight reroutes. */}
            <LandingSectionHeading>
              {t("landing.worldInYear", { year: eraConfig.year })}
            </LandingSectionHeading>
            <p className="mb-8 mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">
              {getEraFlavorCards(era).some((card) => card.kind === "brief")
                ? t("landing.carouselDekBriefs")
                : t("landing.carouselDek")}
            </p>
            <FlavorCardCarousel staticCards={getEraFlavorCards(era)} crises={crises} />
          </div>
        </section>

        {/* Learn the game */}
        <section className="border-t border-card-border">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            <LandingSectionHeading>{t("landing.learnHeading")}</LandingSectionHeading>
            <p className="mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">
              {t("landing.learnDek")}
            </p>
            <ul className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {learn.map((item) => (
                <LandingListItem
                  key={item.href}
                  title={item.title}
                  body={item.body}
                  href={item.href}
                  linkLabel={item.cta}
                />
              ))}
            </ul>
          </div>
        </section>

        <CommunitySupportSection initialStats={discordStats} />

        {/* Closing CTA */}
        <section className="border-t border-card-border">
          <div className="mx-auto max-w-7xl px-5 py-16 text-center sm:px-8 sm:py-24">
            <h2 className="text-heading-lg font-semibold tracking-tight text-foreground sm:text-display">
              {eraConfig.closingHeadline}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-body-lg text-muted">{eraConfig.closingDek}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={l.closing} className={PRIMARY_BUTTON_CLASSES}>
                {isSignedIn ? t("landing.backToDashboard") : eraConfig.closingCta}
                <span aria-hidden="true">→</span>
              </Link>
              {/* Moved out of the hero: the Android build is for people already
                  sold on the game, so it belongs at the bottom of the read. */}
              <a
                href={ANDROID_BETA_APK_URL}
                download
                target="_blank"
                rel="noopener noreferrer"
                className={GHOST_BUTTON_CLASSES}
              >
                {t("landing.getApp")}
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </section>

        {/* Public-page tray. Every bento tile above sends a signed-out visitor
            to /login, so without this strip the only way off the lander is the
            sign-up form, while a dozen routes are readable with no account.
            Inventory and the "actually anonymous-readable" rule: publicLinks.ts. */}
        <section className="border-t border-card-border">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
            <LandingSectionHeading>{t("landing.tray.heading")}</LandingSectionHeading>
            <p className="mb-6 mt-2 max-w-2xl text-body leading-relaxed text-muted">
              {t("landing.tray.dek")}
            </p>
            <nav
              aria-label={t("landing.tray.navLabel")}
              className="flex flex-wrap gap-x-6 gap-y-2 text-body"
            >
              {tray.map((item) => (
                <LandingNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  external={item.external}
                  className={LANDING_TEXT_LINK_CLASS}
                />
              ))}
            </nav>
          </div>
        </section>

        {/* Footer: site navigation + tagline + image attributions */}
        <footer className="border-t border-card-border bg-card-muted/30">
          <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
            <nav
              aria-label={t("landing.footer.navLabel")}
              className="mx-auto mb-8 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-10 text-left sm:grid-cols-4"
            >
              {footer.map((col) => (
                <div key={col.headingKey}>
                  <h3 className="mb-2 text-sm font-semibold text-muted">{col.heading}</h3>
                  <ul className="space-y-1.5">
                    {col.links.map((link) => (
                      <li key={link.href}>
                        <LandingNavLink
                          href={link.href}
                          label={link.label}
                          external={link.external}
                          className="text-body-sm text-muted transition-colors hover:text-foreground"
                        />
                      </li>
                    ))}
                    {col.headingKey === "landing.footer.legal" && (
                      <li>
                        <CookieSettingsLink className="text-body-sm text-muted transition-colors hover:text-foreground" />
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          <div className="mx-auto max-w-7xl border-t border-card-border/60 px-5 py-8 text-center sm:px-8">
            <p className="text-body-sm text-muted">{eraConfig.footerTagline}</p>
            <a
              href="https://lakesidegames.net"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-body-sm text-muted transition-colors hover:text-foreground"
            >
              <Image
                src="/lakeside-mark.svg"
                alt="Lakeside Games"
                width={20}
                height={20}
                className="opacity-80"
              />
              <span>{t("landing.byLakeside")}</span>
            </a>
            <p className="mx-auto mt-3 max-w-3xl text-body-xs leading-relaxed text-muted">
              {t("landing.attribution")}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
