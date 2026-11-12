import type { Metadata, Viewport } from "next";
import {
  isClientShellUserAgent,
  hasNativeStatusDockUserAgent,
  isInAppWebViewUserAgent,
  isIosStoreAppUserAgent,
  isStoreAppUserAgent,
} from "@/lib/displayMode";
import { Fraunces, Geist, Geist_Mono, JetBrains_Mono, Lora } from "next/font/google";
import { redirect } from "next/navigation";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NavbarWrapper } from "@/components/NavbarWrapper";
import { BugReportFab } from "@/components/BugReportFab";
import { AskDrawer } from "@/components/askDrawer/AskDrawer";
import { StatusBar } from "@/components/StatusBar";
import {
  DeferredSeasonRecapGate,
  DeferredStatAllocationGate,
  DeferredWealthTierRepickGate,
  DeferredTutorialCoachMount,
  DeferredSingleplayerGuide,
  DeferredTurnProgressToast,
  DeferredNominationChoicePrompt,
} from "@/components/DeferredShellOverlays";
import { FeedbackProvider } from "@/contexts/FeedbackContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { BrowserPreferencesProvider } from "@/contexts/BrowserPreferencesContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { CharacterStatsProvider } from "@/contexts/CharacterStatsContext";
import { AppInterfaceProvider } from "@/contexts/InterfaceContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { RegisteredCountriesProvider } from "@/contexts/RegisteredCountriesContext";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { loadCountryNameOverrides } from "@/lib/country/countryIdentity";
import { buildCurrencyBaselineRates } from "@/lib/currency/baselineRates";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import { getDb } from "@/lib/mongodb";
import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countries";
import { LiveRefreshBanner } from "@/components/LiveRefreshBanner";
import { VpnGateBanner } from "@/components/VpnGateBanner";
import { MassCrashAlertBanner } from "@/components/MassCrashAlertBanner";
import { MaintenancePartialBanner } from "@/components/MaintenancePartialBanner";
import { PollBannerNotice } from "@/components/PollBannerNotice";
import { isSingleplayer } from "@/lib/singleplayer";
import { AdSlot } from "@/components/AdSlot";
import { AdSenseSlot } from "@/components/AdSenseSlot";
import { CookieConsentBanner } from "@/components/CookieConsent";
import { COOKIE_CONSENT_KEY } from "@/lib/analytics/storageKeys";
import { SiteFooter } from "@/components/SiteFooter";
import { AuthConnectivityGate } from "@/components/AuthConnectivityGate";
import { SiteTrafficTracker } from "@/components/SiteTrafficTracker";
import { DeferredAnalytics } from "@/components/DeferredAnalytics";
import { CDN_LOGO_URL } from "@/lib/images/cdnStaticUrls";
import {
  buildGoogleTagBootstrapScript,
  getAdSenseClientId,
  getAdSensePageTagUrl,
  shouldRenderConsentManagedGoogleTags,
  shouldRenderGooglePrivacyMessaging,
} from "@/lib/googlePrivacyMessaging";
import {
  DEFAULT_SITE_DESCRIPTION,
  SITE_BRAND,
  SITE_SUBTITLE,
  buildSiteDescription,
  getSiteUrl,
} from "@/lib/siteMetadata";
import { nationKeywords } from "@/lib/marketing/marketedWorld";
import { getMarketedWorldSafe } from "@/lib/marketing/marketedWorldServer";
import { getEraConfig } from "@/components/landing/eraThemes";
import { verifyAuth } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";
import { getCachedMaintenanceStatus, isMaintenanceBypassPath } from "@/lib/maintenanceStatus";
import { pickClientNamespaces, SHELL_CLIENT_NAMESPACES } from "@/i18n/clientCatalog";
import { resolveNavbarPageCountry } from "@/lib/navigation/resolveNavbarPageCountry";
import "./globals.css";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";

// Geist Sans is the only preloaded family: it renders above the fold on a
// cold anonymous load, including the landing page's LCP element. The mono
// families load lazily and would otherwise compete for the connection during
// first paint. `display: "swap"` plus next/font's size-adjust fallback avoids
// layout shift.
//
// Variable classes go on <html>, not <body>: the Tailwind theme declares
// --font-sans on :root as var(--font-geist-sans), and a custom property only
// resolves against variables on its own element or an ancestor.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// Classic interface headings use the same editorial families that shipped
// before the October 3 redesign. Neither is preloaded because modern mode is
// the default and should not pay for fonts it never renders.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// Used by the 1953 CRT command theme (globals.css) and by the Blend campaign /
// election screens, which set every numeric and label in it. Neither is the
// default landing surface, so it stays out of the preload set.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const siteUrl = getSiteUrl();
const defaultDocumentTitle = `${SITE_BRAND} | ${SITE_SUBTITLE}`;
const GA_MEASUREMENT_ID = "G-5GBG3BHWCZ";
const GOOGLE_ADS_ID = "AW-18130975758";
// Optional self-hosted umami tag. Both vars must be set; see the script block
// at the end of the layout for why the host is not hardcoded.
const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC?.trim();
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();

/**
 * Edge to edge on notched phones. Without `cover`, iOS insets the page below
 * the status bar and content scrolls through the strip above the sticky
 * navbar. The navbar, drawers, modals and bottom status bar pad themselves
 * with env(safe-area-inset-*), which only resolves to non-zero under `cover`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Async so the description and SEO keywords reflect the countries currently
 * open to players. Source of truth is `lib/marketing/marketedWorldServer`,
 * served from a 5-minute in-process cache (no Mongo round-trip per request).
 */
export async function generateMetadata(): Promise<Metadata> {
  const world = await getMarketedWorldSafe();
  const description = buildSiteDescription(world);
  const keywords = [
    "political simulation game",
    "economic simulation",
    "multiplayer elections",
    "congress",
    "parliament",
    "campaigns",
    "corporations",
    "forex",
    ...nationKeywords(world.playable),
  ].join(", ");

  return {
    title: defaultDocumentTitle,
    // Icons are automatically picked up from icon.png and apple-icon.png in app directory
    description,
    manifest: "/manifest.webmanifest",
    metadataBase: new URL(siteUrl),
    openGraph: {
      title: defaultDocumentTitle,
      description,
      type: "website",
      siteName: SITE_BRAND,
      url: siteUrl,
      locale: "en_US",
      images: [
        {
          url: CDN_LOGO_URL,
          width: 256,
          height: 256,
          alt: SITE_BRAND,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultDocumentTitle,
      description,
      images: [CDN_LOGO_URL],
    },
    keywords,
  };
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_BRAND,
  description: DEFAULT_SITE_DESCRIPTION,
  applicationCategory: "Game",
  operatingSystem: "Web",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, requestHeaders, locale, intlMessages, t, world] = await Promise.all([
    cookies(),
    headers(),
    getLocale(),
    getMessages(),
    getTranslations("layout"),
    getMarketedWorldSafe(),
  ]);
  // A broadcast-era world (1991) types its name into the navbar on load.
  const typedWordmark = Boolean(getEraConfig(world.seedYear).broadcast);
  const userAgent = requestHeaders.get("user-agent") ?? "";
  // Both the Capacitor app and the AHDClient mobile shell: no ad slots, no
  // consent prompts, no cookie banner inside an app webview.
  const isNativeApp = isInAppWebViewUserAgent(userAgent);
  const isClientShell = isClientShellUserAgent(userAgent);
  // The 2.10 phone app shows status in its own dock; keep one bar on screen.
  const nativeStatusDock = hasNativeStatusDockUserAgent(userAgent);
  const isStoreApp = isStoreAppUserAgent(userAgent);
  const isIosStoreApp = isIosStoreAppUserAgent(userAgent);
  const host = requestHeaders.get("host");
  const pathname = requestHeaders.get("x-pathname") ?? "/";
  // Only a cookie's presence is checked, not its validity: this is the hint that
  // lets the status bar start its per-user request with the first paint instead
  // of one `/api/client-nav` round trip later. An expired token costs one
  // request that can only 401, which the shared status request then treats as a
  // sign-out. A singleplayer build has no session cookie and no account, and
  // keeps its local character without this hint.
  const hasSessionCookie = Boolean(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const displayMode = cookieStore.get("ahd-display-mode")?.value as
    "focused" | "classic" | undefined;
  const interfaceMode =
    cookieStore.get("ahd-interface-mode")?.value === "classic" ? "classic" : "modern";

  // Runtime country sets hydrated into the client tree via RegisteredCountriesProvider:
  //  - `registered` (COUNTRY_ORDER ∪ activated latent countries, e.g. a seceded SCO/WAL) for
  //    admin tooling, which manages every country that exists.
  //  - `enabled` (the player-live subset) for the player-facing nation switcher, so a
  //    registered-but-not-yet-enabled country stays hidden until activation flips it on.
  // The root layout must never crash on a DB hiccup — fall back to the static base.
  let registeredCountries: CountryId[] = COUNTRY_ORDER;
  let enabledCountries: CountryId[] = COUNTRY_ORDER;
  let activePreset = "2019-default";
  // Runtime renames, so client surfaces stop naming a country by its compiled
  // seed name after something has renamed it — a reunified Germany read as
  // "East Germany" in every client-rendered navbar and card while the
  // server-rendered pages called it Germany.
  let countryNameOverrides: Partial<Record<CountryId, string>> = {};
  try {
    const db = await getDb();
    // Only the reset preset is needed here, so read it with a `{ preset: 1 }`
    // projection instead of deserializing the full ~37KB gameState document
    // (turn-phase map, census deltas, audit metadata) on every page load.
    const [registered, enabled, preset, nameOverrides] = await Promise.all([
      getRegisteredCountryIds(db),
      getEnabledCountryIds(),
      getGameStatePreset(db),
      loadCountryNameOverrides(db),
    ]);
    registeredCountries = registered;
    enabledCountries = enabled;
    activePreset = preset ?? DEFAULT_SEED_PRESET;
    countryNameOverrides = nameOverrides;
  } catch {
    // keep the COUNTRY_ORDER + 2019-default + no-override fallback
  }
  if (!isSingleplayer() && !isMaintenanceBypassPath(pathname)) {
    // Fail-open if the maintenance lookup throws. The proxy is the primary
    // gate; this layout-level check is defense in depth, so a transient DB
    // blip here should render the page rather than 500 the whole layout.
    //
    // Only "full" redirects every page — "partial" leaves pages reachable.
    let maintenanceMode: "off" | "partial" | "full" = "off";
    try {
      const maintenance = await getCachedMaintenanceStatus();
      maintenanceMode = maintenance.mode;
    } catch (err) {
      console.warn("[layout] maintenance lookup failed; rendering page", err);
    }
    if (maintenanceMode === "full") {
      // verifyAuth now propagates non-JOSE errors so transient throws don't
      // silently log users out elsewhere. Here we fail closed — any failure
      // to confirm admin during maintenance mode redirects to /maintenance.
      let authPayload: Awaited<ReturnType<typeof verifyAuth>> = null;
      try {
        authPayload = await verifyAuth();
      } catch (err) {
        console.warn("[layout] verifyAuth threw during maintenance check", err);
      }
      if (authPayload?.isAdmin !== true) {
        redirect("/maintenance");
      }
    }
  }

  const isWikiSubdomain =
    host === "wiki.ahousedividedgame.com" || (host?.startsWith("wiki.") ?? false);

  // Fallback display rates for currencies outside the forex set. Built here on
  // the server so the client does not need the whole country config to price an
  // economy-anchored label.
  const currencyBaselineRates = buildCurrencyBaselineRates(activePreset);

  const initialPageCountry = await resolveNavbarPageCountry({
    pathname,
    search: requestHeaders.get("x-search"),
  });
  // Root layout does not re-render on client navigation, so it ships only
  // what its own client tree renders; app/template.tsx adds the rest per route.
  const clientMessages = pickClientNamespaces(intlMessages, SHELL_CLIENT_NAMESPACES);
  const adSenseClientId = getAdSenseClientId();
  // Never load the AdSense page tag (auto ads + CMP) inside the native app
  // WebView: AdSense is not permitted in app WebViews, and its third-party
  // requests are routinely killed by mobile DNS filters / adblockers, which
  // the Android shell used to misread as the server being unreachable.
  // The page tag enables Google Auto ads. Loading it on a game, account, or
  // community screen can result in Google-served ads on a non-editorial page,
  // even when no manual AdSense component is mounted there.
  const renderGoogleCmp = shouldRenderGooglePrivacyMessaging(pathname, host) && !isNativeApp;
  // Server component, so this is a plain call. Throws on a deployment
  // that sets SINGLEPLAYER, by design: see @/lib/singleplayer.
  const singleplayer = isSingleplayer();
  const renderConsentManagedGoogleTags = shouldRenderConsentManagedGoogleTags(pathname, {
    storeApp: isStoreApp,
  });
  const googleTagBootstrap = buildGoogleTagBootstrapScript(
    GA_MEASUREMENT_ID,
    renderGoogleCmp ? "cmp" : "fallback"
  );

  return (
    <html
      lang={locale}
      data-store-app={isStoreApp ? "true" : undefined}
      data-store-os={isStoreApp ? (isIosStoreApp ? "ios" : "android") : undefined}
      data-interface={interfaceMode}
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <Script
          id="ld-json"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Script
          id="display-mode"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__AHD_DISPLAY_MODE=${JSON.stringify(displayMode ?? null)};`,
          }}
        />
        {/* Applied before first paint so a returning player never sees the
            consent banner flash, and a first-time visitor gets it as part of
            FCP instead of a post-hydration mount. See CookieConsentBanner. */}
        <Script
          id="cookie-consent-mode"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem(${JSON.stringify(COOKIE_CONSENT_KEY)});if(c==="accepted"||c==="rejected"){document.documentElement.dataset.cookieConsent=c;}}catch(e){}`,
          }}
        />
        {renderGoogleCmp ? (
          <>
            <Script
              id="google-privacy-messaging-bootstrap"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html:
                  "window.googlefc = window.googlefc || {}; window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];",
              }}
            />
            {/*
              lazyOnload: the AdSense page tag is ~56KB and pulls in
              show_ads_impl (~186KB more). Moving it from beforeInteractive to
              afterInteractive cut Total Blocking Time from 2398ms to 1483ms
              (landing, 4x CPU, 1.6Mbps; audit 2026-07-26). It still competed
              with hydration on first load, so it now joins the rest of the
              Google tags behind the load event: the 2026-11 Lighthouse audit
              measured gtag+ads as the largest single blocking source on every
              page (600-750ms of long tasks).

              The googlefc consent bootstrap above stays beforeInteractive so
              the CMP callback queue still exists before any consent callback
              can fire; only the tag fetch is deferred, which matches Google's
              own async-loading guidance.
            */}
            <Script
              src={getAdSensePageTagUrl(adSenseClientId!)}
              strategy="lazyOnload"
              crossOrigin="anonymous"
            />
          </>
        ) : null}
        <a
          href="#main-content"
          className="absolute -top-24 left-4 z-[200] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-[top] duration-150 focus:top-4 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        >
          {t("skipToMainContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <RegisteredCountriesProvider
            value={{
              registered: registeredCountries,
              enabled: enabledCountries,
              preset: activePreset,
              nameOverrides: countryNameOverrides,
            }}
          >
            <AppInterfaceProvider initialMode={interfaceMode} initialHasSession={hasSessionCookie}>
              <CurrencyProvider baselineRates={currencyBaselineRates}>
                <ThemeProvider>
                  <BrowserPreferencesProvider>
                    <FeedbackProvider>
                      <ToastProvider>
                        <CharacterStatsProvider>
                          {!isWikiSubdomain && (
                            <NavbarWrapper
                              singleplayer={singleplayer}
                              clientShell={isClientShell}
                              phoneApp={isStoreApp}
                              displayMode={displayMode}
                              initialPageCountry={initialPageCountry}
                              typedWordmark={typedWordmark}
                            />
                          )}
                          {!isWikiSubdomain && <BugReportFab displayMode={displayMode} />}
                          {/* Experimental opt-in (Settings). Singleplayer has no Ask service. */}
                          {!isWikiSubdomain && !singleplayer && <AskDrawer />}
                          {!isWikiSubdomain && <VpnGateBanner />}
                          {!isWikiSubdomain && <MassCrashAlertBanner />}
                          {!isWikiSubdomain && <MaintenancePartialBanner />}
                          {/* Admin-controlled survey strip. Not auth-gated: it must reach
                            signed-out visitors too. */}
                          {!isWikiSubdomain && <PollBannerNotice />}
                          <AuthConnectivityGate />
                          <DeferredStatAllocationGate />
                          <DeferredWealthTierRepickGate />
                          <DeferredSeasonRecapGate />
                          <DeferredNominationChoicePrompt />
                          {/* overflow-x-CLIP, not -hidden: hidden makes this element the
                            scroll container for every `position: sticky` descendant
                            (admin status bar / sidebars / table headers), which both
                            displaces them by their `top` offset at rest and prevents
                            them from ever sticking to the viewport. clip gives the same
                            horizontal clipping without creating a scroll container. */}
                          <main
                            id="main-content"
                            className={
                              nativeStatusDock
                                ? "min-w-0 overflow-x-clip pb-4"
                                : "min-w-0 overflow-x-clip pb-[max(3.5rem,var(--status-bar-height,0px),var(--mobile-dock-height,0px))]"
                            }
                            tabIndex={-1}
                          >
                            <SiteTrafficTracker gameVersion={world.version} />
                            {!singleplayer && !isNativeApp && !isWikiSubdomain && (
                              <DeferredAnalytics />
                            )}
                            {children}
                          </main>
                          {!isWikiSubdomain && !isNativeApp && <AdSlot />}
                          {!isWikiSubdomain && !isNativeApp && <AdSenseSlot />}
                          {!isWikiSubdomain && <SiteFooter displayMode={displayMode} />}
                          {!isWikiSubdomain && !nativeStatusDock && (
                            <StatusBar
                              showOnlineStatus={!isClientShell}
                              turnStatusLink={!singleplayer}
                            />
                          )}
                          {!isWikiSubdomain && singleplayer && <DeferredTurnProgressToast />}
                          {!isWikiSubdomain && singleplayer && <DeferredSingleplayerGuide />}
                          {!isWikiSubdomain && <DeferredTutorialCoachMount />}
                          {!isWikiSubdomain && <LiveRefreshBanner />}
                          {/* Singleplayer loads no analytics (see below), so there is
                              nothing to consent to. */}
                          {!isNativeApp && !singleplayer && (
                            <CookieConsentBanner googleCmp={renderGoogleCmp} />
                          )}
                          {/* A singleplayer build runs on the player's machine with no
                              account and nothing to measure, so none of the telemetry
                              or ad tags below have a job there.
                              `@vercel/analytics` and `@vercel/speed-insights` used to
                              sit here too. Production is Railway, so the
                              `/_vercel/insights/script.js` and
                              `/_vercel/speed-insights/script.js` they inject at runtime
                              404 — and the Next 404 page they get back is ~34KB brotli,
                              `private, no-store`, `cf-cache-status: BYPASS`. That cost
                              every full document load two origin round-trips, two SSR
                              404 renders and ~68KB for telemetry that never recorded
                              anything. Removed 2026-09-06; see layout.telemetry.test.ts.
                              Page views are already covered by SiteTrafficTracker and
                              the self-hosted umami tag below. */}
                          {!singleplayer && (
                            <>
                              {/* GA4 and the Ads conversion tag also wait for
                                  the load event. The consent default is still
                                  pushed into dataLayer before gtag.js runs
                                  (the bootstrap reads localStorage itself), so
                                  deferring the fetch delays when Google starts
                                  counting, not whether it respects consent. */}
                              {renderConsentManagedGoogleTags ? (
                                <>
                                  <Script
                                    src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                                    strategy="lazyOnload"
                                  />
                                  <Script
                                    id="google-analytics"
                                    strategy="lazyOnload"
                                    dangerouslySetInnerHTML={{
                                      __html: googleTagBootstrap,
                                    }}
                                  />
                                  <Script
                                    id="google-ads"
                                    strategy="lazyOnload"
                                    dangerouslySetInnerHTML={{
                                      __html: `gtag('config', '${GOOGLE_ADS_ID}');`,
                                    }}
                                  />
                                </>
                              ) : null}
                              {/* Optional self-hosted umami tag. The host is
                                  configured rather than hardcoded: the old
                                  analytics.lakesidegames.net instance stopped
                                  resolving, and the hardcoded tag shipped a
                                  failed request plus a console error (a Best
                                  Practices failure) on every page. Set both
                                  NEXT_PUBLIC_UMAMI_SRC and
                                  NEXT_PUBLIC_UMAMI_WEBSITE_ID to enable it. */}
                              {umamiSrc && umamiWebsiteId ? (
                                <Script
                                  id="umami-analytics"
                                  src={umamiSrc}
                                  data-website-id={umamiWebsiteId}
                                  strategy="afterInteractive"
                                />
                              ) : null}
                            </>
                          )}
                        </CharacterStatsProvider>
                      </ToastProvider>
                    </FeedbackProvider>
                  </BrowserPreferencesProvider>
                </ThemeProvider>
              </CurrencyProvider>
            </AppInterfaceProvider>
          </RegisteredCountriesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
