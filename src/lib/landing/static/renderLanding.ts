/**
 * The signed-out landing page as one HTML string: no React, no framework
 * script. Interactivity is three small islands (countdown, cookie choice with
 * anonymous counts, globe) loaded as plain files. Class names are Tailwind's,
 * compiled to a stylesheet by scripts/landing/build-landing-css.mjs from this
 * file, so a visitor sees the look the app shell would have given them.
 */
import { esc, jsonForScript } from "./html";
import { formatEastern, formatRemaining } from "../launchFormat";
import { resolveEraCopy } from "@/lib/marketing/eraCopy";
import { cdnStatic } from "@/lib/images/cdnUrls";
import { CDN_LOGO_URL } from "@/lib/images/cdnStaticUrls";
import {
  BACKGROUND_MACRO_COLOR,
  TIER_COLORS,
  TIER_LABELS,
  TIER_ORDER,
} from "@/components/landing/countryTiers";
import { FLAVOR_CARD_PORTRAITS, type FlavorCard } from "@/components/landing/flavorCards";
import type { EraConfig, EraNation, EraTileKey } from "@/components/landing/eraThemes";
import type { LaunchSchedule } from "@/lib/landing/rules/launchSchedule";
import type { MarketedWorld } from "@/lib/marketing/marketedWorld";
import { COMMUNITY_DISCORD_URL, COMMUNITY_PATREON_URL } from "@/lib/communityLinks";
import { LANDING_FOOTER_SECTIONS, LANDING_TRAY_LINKS } from "@/app/_landing-v2/publicLinks";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface LandingCrisis {
  _id: string;
  name: string;
  description: string;
  heroImage?: string;
  scope: "global" | "country" | "region";
  countryIds: string[];
}

export interface StaticLandingInput {
  t: Translate;
  /** Navbar and skip-link labels, from the `nav` and `layout` namespaces. */
  labels: { contests: string; help: string; signIn: string; register: string; skip: string };
  /** True when the era draws its background nations as simulated (macro). */
  macroSimulated: boolean;
  locale: string;
  era: EraConfig;
  world: MarketedWorld;
  launch: LaunchSchedule | null;
  currentYear: number;
  government: Record<string, boolean>;
  crises: LandingCrisis[];
  discord: { memberCount: number; onlineCount: number } | null;
  flavorCards: FlavorCard[];
  posterBase: string | null;
  /** Everything the globe island reads: tiers, markers, rotation. */
  globe: Record<string, unknown>;
  /** `<head>` values taken from the same metadata the app page uses. */
  meta: {
    title: string;
    description: string;
    keywords: string;
    canonical: string;
    siteName: string;
    ogImage: string;
    jsonLd: string;
  };
  css: string;
  islands: { countdown: string; consent: string; globe: string };
  posthogKey: string | null;
  gameVersion: string;
}

const PRIMARY_BUTTON =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4.5 h-11 text-sm font-semibold text-white transition-all duration-150 hover:bg-primary-dark active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const SECONDARY_BUTTON =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-card-border bg-card px-4.5 h-11 text-sm font-medium text-foreground transition-all duration-150 hover:border-muted/40 active:scale-[0.98]";
const GHOST_BUTTON =
  "pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-4.5 h-11 text-sm font-medium text-muted transition-all duration-150 hover:text-foreground active:scale-[0.98]";
const TEXT_LINK =
  "font-medium text-foreground underline decoration-card-border underline-offset-4 transition-colors hover:decoration-foreground";
const ANDROID_BETA_APK_URL = "https://ops.lakesidegames.net/downloads/a-house-divided-0.3.1.apk";

const TILE_KEYS: readonly EraTileKey[] = [
  "stateMetrics",
  "ballot",
  "bills",
  "industrial",
  "markets",
  "newsroom",
  "centralBanks",
];
const TIER_GROUPS: readonly EraNation["tier"][] = ["player", "econ", "npp", "background"];

function navLink(href: string, label: string, external: boolean, className: string): string {
  return external
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="${className}">${esc(label)}<span aria-hidden="true" class="ml-1">↗</span></a>`
    : `<a href="${esc(href)}" class="${className}">${esc(label)}</a>`;
}

function listItem(title: string, body: string, href: string, linkLabel: string): string {
  return `<li><a href="${esc(href)}" class="group block"><h3 class="text-body-lg font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">${esc(title)}</h3><p class="mt-1 text-body leading-relaxed text-muted">${esc(body)}</p><span class="mt-2 inline-flex items-center gap-1 text-body-sm font-medium text-foreground">${esc(linkLabel)}<span aria-hidden="true">→</span></span></a></li>`;
}

function sectionHeading(text: string): string {
  return `<h2 class="text-heading-lg font-semibold tracking-tight text-foreground">${esc(text)}</h2>`;
}

function launchBlock(input: StaticLandingInput): string {
  const { launch, t, locale } = input;
  if (!launch || (!launch.opensAt && !launch.firstTurnAt)) return "";
  const note =
    launch.phase === "sealed"
      ? t("landing.world2027.sealedNote")
      : launch.phase === "open"
        ? t("landing.world2027.openNote")
        : null;
  const row = (label: string, at: string) =>
    `<div data-countdown-row class="flex flex-wrap items-baseline gap-x-5"><dt class="text-[#ff4d5e] sm:w-[6.25rem]">${esc(label)}</dt><dd class="order-3 basis-full text-white/60 sm:order-2 sm:basis-auto"><time dateTime="${esc(at)}">${esc(t("landing.world2027.easternTime", { time: formatEastern(at, locale) }))}</time></dd><dd data-countdown="${esc(at)}" class="order-2 ml-auto text-white tabular-nums sm:order-3 sm:ml-0" aria-hidden="true">${formatRemaining(null)}</dd></div>`;
  return `<div data-countdown-block class="mb-6"><dl class="flex max-w-full flex-col gap-y-2 rounded-md border border-white/15 bg-black/40 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] sm:inline-flex sm:gap-y-1.5 sm:text-xs">${
    launch.opensAt ? row(t("landing.world2027.opensLabel"), launch.opensAt) : ""
  }${
    launch.firstTurnAt ? row(t("landing.world2027.firstTurnLabel"), launch.firstTurnAt) : ""
  }</dl>${note ? `<p class="mt-2 text-xs text-white/55">${esc(note)}</p>` : ""}</div>`;
}

function headline(input: StaticLandingInput): string {
  const { era } = input;
  const text = era.heroHeadline;
  const year = String(era.year);
  const at = text.lastIndexOf(year);
  const body =
    at < 0
      ? esc(text)
      : `${esc(text.slice(0, at))}<span class="ahd-bc-odometer text-[#ff4d5e]">${esc(
          Math.max(era.year, input.currentYear)
        )}</span>${esc(text.slice(at + year.length))}`;
  return era.broadcast
    ? `<h1 class="ahd-bc-headline text-balance text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-[2.75rem] lg:text-[2.95rem]">${body}</h1>`
    : `<h1 class="text-display font-bold leading-tight tracking-tight text-foreground">${body}</h1>`;
}

function tierKey(input: StaticLandingInput): string {
  const counts = input.era.broadcast?.tierCounts;
  if (!input.era.broadcast) return "";
  const tiers = counts ? TIER_ORDER.filter((tier) => counts[tier]) : TIER_ORDER;
  const simulated = input.macroSimulated;
  const items = tiers
    .map(
      (tier) =>
        `<li class="inline-flex items-center gap-2"><span class="h-2 w-2 shrink-0 rounded-[2px]" style="background:${
          tier === "background" && simulated ? BACKGROUND_MACRO_COLOR : TIER_COLORS[tier]
        }"></span><span class="font-mono text-[10px] uppercase tracking-[0.12em] text-white/70">${esc(
          TIER_LABELS[tier]
        )}</span>${
          counts?.[tier] !== undefined
            ? `<span class="font-mono text-[10px] tabular-nums text-white">${counts[tier]}</span>`
            : ""
        }</li>`
    )
    .join("");
  return `<div class="absolute inset-x-0 bottom-[calc(12vh+1rem)]"><div class="mx-auto w-full max-w-7xl px-5 sm:px-8"><ul aria-hidden="true" class="mb-2.5 hidden flex-wrap justify-end gap-x-5 gap-y-1.5 sm:flex opacity-90">${items}</ul></div></div>`;
}

function poster(base: string): string {
  return `<picture data-globe-poster class="pointer-events-none absolute inset-0 transition-opacity duration-500"><source type="image/avif" srcset="${esc(base)}-960.avif"/><img src="${esc(base)}-960.webp" alt="" width="960" height="960" decoding="async" class="h-full w-full object-cover"/></picture>`;
}

function navbar(input: StaticLandingInput): string {
  return `<nav data-site-navbar="true" class="sticky top-0 z-50 border-b pt-[env(safe-area-inset-top,0px)] border-card-border bg-card/50 backdrop-blur-md"><div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><a href="/" class="flex items-center gap-2"><img alt="" width="40" height="40" decoding="async" class="object-contain" src="${esc(CDN_LOGO_URL)}"/><span class="text-lg font-semibold tracking-tight font-mono">${esc(input.meta.siteName)}</span></a><div class="flex items-center gap-1 text-sm"><a href="/contests" class="hidden rounded-lg px-3 py-2 font-medium text-muted transition-colors hover:text-foreground md:inline-flex">${esc(input.labels.contests)}</a><a href="/faq" class="hidden rounded-lg px-3 py-2 font-medium text-muted transition-colors hover:text-foreground md:inline-flex">${esc(input.labels.help)}</a><a href="/login" class="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground">${esc(input.labels.signIn)}</a><a href="/register" class="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark">${esc(input.labels.register)}</a></div></div></nav>`;
}

function rosterSection(input: StaticLandingInput): string {
  const { era, t, world } = input;
  const byTier = era.rosterGrouping === "tier";
  const western: EraNation[] = [];
  const eastern: EraNation[] = [];
  for (const nation of era.nations) (input.government[nation.id] ? eastern : western).push(nation);
  const groups = byTier
    ? TIER_GROUPS.map((id) => ({
        label: t(`landing.tierGroups.${id}`),
        countries: era.nations.filter((nation) => nation.tier === id),
      })).filter((group) => group.countries.length > 0)
    : [
        { label: t("landing.blocs.western"), countries: western },
        { label: t("landing.blocs.eastern"), countries: eastern },
      ].filter((group) => group.countries.length > 0);
  const tierMeta: Record<EraNation["tier"], { label: string; title: string }> = {
    player: { label: t("landing.tiers.playable"), title: t("landing.tiers.playableTitle") },
    econ: { label: t("landing.tiers.economy"), title: t("landing.tiers.economyTitle") },
    npp: { label: t("landing.tiers.computerRun"), title: t("landing.tiers.computerRunTitle") },
    background: { label: t("landing.tiers.background"), title: t("landing.tiers.backgroundTitle") },
  };
  const columns = groups
    .map(({ label, countries }) => {
      const rows = countries
        .map(
          (c) =>
            `<li class="flex items-baseline justify-between gap-3 text-body"><span class="${
              c.tier === "npp" || c.tier === "background" ? "text-muted" : "text-foreground"
            }">${esc(c.name)}</span>${
              byTier
                ? ""
                : `<span class="shrink-0 text-body-sm text-muted" title="${esc(tierMeta[c.tier].title)}">${esc(tierMeta[c.tier].label)}</span>`
            }</li>`
        )
        .join("");
      return `<div class="roster-group transition-opacity duration-200"><h4 class="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-foreground">${esc(label)}<span class="text-body-sm font-normal text-muted">${esc(
        t("landing.nationCount", { count: countries.length })
      )}</span></h4><ul class="mt-2 grid gap-x-8 gap-y-1.5 ${
        byTier && countries.length < 6 ? "" : "sm:grid-cols-2"
      }">${rows}</ul></div>`;
    })
    .join("");
  return `<div id="world" class="mt-12"><h3 class="text-heading font-semibold text-foreground">${esc(
    t("landing.worldInYear", { year: era.year })
  )}</h3><p class="mt-1 max-w-2xl text-body leading-relaxed text-muted">${esc(
    resolveEraCopy(era.worldSectionDek, world)
  )}</p><div class="roster mt-6 grid gap-x-12 gap-y-8 ${
    byTier ? "lg:grid-cols-[1fr_1fr_2fr]" : "lg:grid-cols-2"
  }">${columns}</div></div>`;
}

const CARD =
  "relative flex-shrink-0 w-[280px] sm:w-[320px] overflow-hidden rounded-xl border border-card-border bg-card shadow-card";

function flavorCard(card: FlavorCard, index: number): string {
  const number = String(index + 1).padStart(2, "0");
  if (card.kind === "brief") {
    return `<div class="${CARD}"><div class="relative flex h-[180px] flex-col justify-between overflow-hidden border-b border-card-border bg-[linear-gradient(to_bottom,rgba(95,227,255,0.07),transparent_70%)] px-4 pb-3 pt-4"><span class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted">${esc(card.title)}</span><span class="font-mono text-[3.25rem] font-semibold leading-none tracking-tight text-foreground tabular-nums">${esc(card.year)}</span><span class="self-start rounded-full border border-card-border bg-card px-2 py-0.5 text-body-xs font-medium text-muted">${esc(card.country)}</span></div><div class="p-4"><div class="mb-1 flex items-center gap-2"><span class="font-mono text-body-xs text-red-300">${number}</span></div><h3 class="text-heading-sm font-semibold text-foreground">${esc(card.name)}</h3><p class="mt-2 text-body-sm leading-relaxed text-muted">${esc(card.quote)}</p></div></div>`;
  }
  const image = FLAVOR_CARD_PORTRAITS.has(card.imageSlug)
    ? `<img src="${esc(cdnStatic("flavor-cards", card.imageSlug))}" alt="${esc(card.name)}" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover object-[center_25%]"/>`
    : "";
  return `<div class="${CARD}"><div class="relative h-[180px] overflow-hidden">${image}<div class="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent"></div><div class="absolute bottom-2 left-3 right-3"><span class="rounded-full border border-card-border bg-card px-2 py-0.5 text-body-xs font-medium text-muted">${esc(card.country)}</span></div></div><div class="p-4"><div class="mb-1 flex items-center gap-2"><span class="font-mono text-body-xs text-red-300">${number}</span><span class="text-body-xs text-muted">${esc(card.year)}</span></div><h3 class="text-heading-sm font-semibold text-foreground">${esc(card.name)}</h3><p class="mt-0.5 text-body-xs text-muted">${esc(card.title)}</p><p class="mt-2 text-body-sm italic leading-relaxed text-muted">&ldquo;${esc(card.quote)}&rdquo;</p></div></div>`;
}

function crisisCard(crisis: LandingCrisis, index: number): string {
  const tag =
    crisis.scope === "global"
      ? "Global Crisis"
      : crisis.scope === "country"
        ? (crisis.countryIds[0] ?? "National Crisis")
        : "Regional Crisis";
  return `<div class="${CARD}"><div class="relative h-[180px] overflow-hidden"><img src="${esc(crisis.heroImage ?? cdnStatic("landing", "newsroom"))}" alt="${esc(crisis.name)}" loading="lazy" decoding="async" class="absolute inset-0 h-full w-full object-cover object-center"/><div class="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent"></div><div class="absolute bottom-2 left-3"><span class="rounded-full border px-2 py-0.5 text-body-xs font-medium bg-red-500/15 text-red-400 border-red-500/25">${esc(tag)}</span></div></div><div class="p-4"><div class="mb-1 flex items-center gap-2"><span class="font-mono text-body-xs text-red-300">${String(index).padStart(2, "0")}</span></div><h3 class="text-heading-sm font-semibold text-foreground">${esc(crisis.name)}</h3><p class="mt-2 text-body-sm leading-relaxed text-muted">${esc(crisis.description)}</p></div></div>`;
}

const DISCORD_GLYPH =
  '<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';
const PATREON_GLYPH =
  '<svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.386 0H8.614C3.858 0 0 3.858 0 8.614v6.772C0 20.142 3.858 24 8.614 24h6.772C20.142 24 24 20.142 24 15.386V8.614C24 3.858 20.142 0 15.386 0zM4.5 17.25V6.75h3.75v10.5H4.5zm7.5 0V6.75H18c2.07 0 3.75 1.68 3.75 3.75S20.07 14.25 18 14.25h-3v3h-3z"/></svg>';

function ctaLink(href: string, primary: boolean, glyph: string, label: string): string {
  const emphasis = primary
    ? "bg-primary text-white hover:bg-primary-dark"
    : "border border-card-border bg-card text-foreground hover:border-muted/40";
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto ${emphasis}">${glyph.replace("h-5 w-5", "h-4 w-4")}${esc(label)}<span aria-hidden="true">→</span><span class="sr-only"> (opens in new tab)</span></a>`;
}

function communitySection(input: StaticLandingInput): string {
  const stats = input.discord
    ? `<div class="mt-5"><p class="flex items-baseline gap-2"><span class="text-heading-lg font-semibold tabular-nums tracking-tight text-foreground">${input.discord.memberCount.toLocaleString("en-US")}</span><span class="text-body text-muted">members</span></p><p class="mt-1 text-body text-muted"><span class="font-medium tabular-nums text-foreground">${input.discord.onlineCount.toLocaleString("en-US")}</span> online now</p></div>`
    : "";
  return `<section class="border-t border-card-border"><div class="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">${sectionHeading("Join the community")}<p class="mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">Meet other players, get help from the team, and help keep the simulation running. The game is free, and Patreon support is optional but deeply appreciated.</p><div class="mt-8 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-2"><article><h3 class="flex items-center gap-2.5 text-heading-sm font-semibold text-foreground">${DISCORD_GLYPH}Discord</h3><p class="mt-0.5 text-body-sm text-muted">Official server</p><p class="mt-4 max-w-md text-body leading-relaxed text-muted">Coordinate campaigns, report bugs, and talk politics with players and admins who are active every day.</p>${stats}${ctaLink(COMMUNITY_DISCORD_URL, true, DISCORD_GLYPH, "Join Discord")}</article><article><h3 class="flex items-center gap-2.5 text-heading-sm font-semibold text-foreground">${PATREON_GLYPH}Patreon</h3><p class="mt-0.5 text-body-sm text-muted">Support the project</p><p class="mt-4 max-w-md text-body leading-relaxed text-muted">Optional monthly support helps fund servers and development. Supporters unlock cosmetic perks, ad preferences, and a private channel on Discord.</p><ul class="mt-5 list-disc space-y-1.5 pl-5 text-body text-muted marker:text-muted"><li>Profile borders and highlight colors</li><li>Ad-free or player-ad-only browsing</li><li>Access to #patreon-support on Discord</li></ul>${ctaLink(COMMUNITY_PATREON_URL, false, PATREON_GLYPH, "Support on Patreon")}</article></div></div></section>`;
}

function cookieBanner(): string {
  return `<div data-cookie-consent-banner="true"><div aria-hidden="true" class="h-56 sm:hidden"></div><div role="dialog" aria-live="polite" aria-label="Cookie consent" class="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[150] mx-auto max-h-[40vh] max-w-3xl overflow-y-auto rounded-xl border border-card-border bg-card shadow-modal sm:inset-x-4 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:max-h-none sm:overflow-visible"><div class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"><div class="flex-1 text-xs leading-snug text-muted sm:text-sm sm:leading-relaxed"><p class="mb-0.5 font-semibold text-foreground sm:mb-1">We use cookies</p><p>We use essential cookies to keep you signed in and the game running. With your permission, PostHog records how you use the game and we may record a sample of sessions to find confusing flows and technical problems. You can reject optional analytics or change your choice at any time. See our <a href="/privacy" class="text-muted underline hover:text-foreground">Privacy policy</a>.</p></div><div class="flex shrink-0 gap-2"><button type="button" data-consent="rejected" aria-label="Reject non-essential cookies" class="inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.98] h-9 px-3.5 text-[13px] rounded-lg text-muted font-medium hover:bg-card hover:text-foreground flex-1 sm:flex-none">Reject</button><button type="button" data-consent="accepted" aria-label="Accept all cookies" class="inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.98] h-9 px-3.5 text-[13px] rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark min-w-0 flex-1 px-4 sm:flex-none">Accept all</button></div></div></div></div>`;
}

/** Starts the globe once the page is idle, the box is on screen and the visitor has engaged. */
const GLOBE_LOADER = `(function(){var b=document.getElementById("globe-box");if(!b||!b.dataset.globeSrc||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var i=0,v=0,e=0,d=0;function go(){if(d||!(i&&v&&e))return;d=1;var s=document.createElement("script");s.src=b.dataset.globeSrc;s.async=true;document.head.appendChild(s)}function idle(){i=1;go()}function engage(){e=1;go()}["pointerdown","touchstart","wheel","keydown"].forEach(function(n){addEventListener(n,engage,{once:true,passive:true})});setTimeout(engage,6000);if("IntersectionObserver"in window){new IntersectionObserver(function(r){v=r.some(function(x){return x.isIntersecting});go()},{rootMargin:"200px"}).observe(b)}else{v=1}function after(){"requestIdleCallback"in window?requestIdleCallback(idle,{timeout:2500}):setTimeout(idle,300)}document.readyState==="complete"?after():addEventListener("load",after,{once:true})})();`;

export function renderLandingHtml(input: StaticLandingInput): string {
  const { t, era, meta } = input;
  const broadcast = Boolean(era.broadcast);
  const tileBody = (key: EraTileKey) => era.tileBodies?.[key] ?? t(`landing.tiles.${key}Body`);
  const heroLinks = [era.explainer, era.newsPost].flatMap((link) =>
    link ? [{ href: link.href, label: link.labelKey ? t(link.labelKey) : link.label }] : []
  );
  const explainer = heroLinks.length
    ? `<div class="pointer-events-auto mt-4 flex flex-wrap gap-x-5 gap-y-2">${heroLinks
        .map(
          (link) =>
            `<a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 transition-colors ${
              broadcast
                ? "text-white/80 decoration-white/30 hover:text-white hover:decoration-white/70"
                : "text-foreground/80 decoration-foreground/30 hover:text-foreground hover:decoration-foreground/70"
            }">${esc(link.label)}<span aria-hidden="true">→</span></a>`
        )
        .join("")}</div>`
    : "";
  const tiles = TILE_KEYS.map((key) =>
    listItem(t(`landing.tiles.${key}`), tileBody(key), "/login", t("landing.enter"))
  ).join("");
  const learn = ["guides", "wiki", "news", "faq"]
    .map((key) =>
      listItem(
        t(`landing.learnLinks.${key}Title`),
        t(`landing.learnLinks.${key}Body`),
        `/${key}`,
        t(`landing.learnLinks.${key}Cta`)
      )
    )
    .join("");
  const cards = [
    ...input.flavorCards.map((card, i) => flavorCard(card, i)),
    ...input.crises.map((crisis, i) => crisisCard(crisis, input.flavorCards.length + i + 1)),
  ].join("");
  const hasBriefs = input.flavorCards.some((card) => card.kind === "brief");
  const footer = LANDING_FOOTER_SECTIONS.map(
    (section) =>
      `<div><h3 class="mb-2 text-sm font-semibold text-muted">${esc(t(section.headingKey))}</h3><ul class="space-y-1.5">${section.links
        .map(
          (link) =>
            `<li>${navLink(link.href, t(link.labelKey), link.external ?? false, "text-body-sm text-muted transition-colors hover:text-foreground")}</li>`
        )
        .join("")}${
        section.headingKey === "landing.footer.legal"
          ? '<li><button type="button" data-cookie-settings aria-label="Privacy &amp; cookie settings" class="text-body-sm text-muted transition-colors hover:text-foreground" style="background:none;border:none;padding:0;cursor:pointer">Privacy &amp; cookie settings</button></li>'
          : ""
      }</ul></div>`
  ).join("");
  const tray = LANDING_TRAY_LINKS.map((link) =>
    navLink(link.href, t(link.labelKey), link.external ?? false, TEXT_LINK)
  ).join("");
  const config = jsonForScript({
    posthogKey: input.posthogKey ?? undefined,
    gameVersion: input.gameVersion,
    globe: input.globe,
  });

  return `<!doctype html><html lang="${esc(input.locale)}" data-interface="modern"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><title>${esc(meta.title)}</title><meta name="description" content="${esc(meta.description)}"/><link rel="manifest" href="/manifest.webmanifest"/><meta name="keywords" content="${esc(meta.keywords)}"/><link rel="canonical" href="${esc(meta.canonical)}"/><meta property="og:title" content="${esc(meta.title)}"/><meta property="og:description" content="${esc(meta.description)}"/><meta property="og:url" content="${esc(meta.canonical)}"/><meta property="og:site_name" content="${esc(meta.siteName)}"/><meta property="og:locale" content="en_US"/><meta property="og:image" content="${esc(meta.ogImage)}"/><meta property="og:image:width" content="256"/><meta property="og:image:height" content="256"/><meta property="og:image:alt" content="${esc(meta.siteName)}"/><meta property="og:type" content="website"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${esc(meta.title)}"/><meta name="twitter:description" content="${esc(meta.description)}"/><meta name="twitter:image" content="${esc(meta.ogImage)}"/><link rel="icon" href="/icon.png" sizes="128x128" type="image/png"/><link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" type="image/png"/><link rel="preload" as="font" type="font/woff2" href="/landing/fonts/geist-latin.woff2" crossorigin/>${
    input.posterBase
      ? `<link rel="preload" as="image" type="image/avif" href="${esc(input.posterBase)}-960.avif"/>`
      : ""
  }<style>${input.css}</style><script>try{var c=localStorage.getItem("ahd-cookie-consent");if(c==="accepted"||c==="rejected"){document.documentElement.dataset.cookieConsent=c}}catch(e){}</script><script type="application/ld+json">${meta.jsonLd.replace(/</g, "\\u003c")}</script></head><body class="antialiased"><a href="#main-content" class="absolute -top-24 left-4 z-[200] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-[top] duration-150 focus:top-4 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">${esc(input.labels.skip)}</a>${navbar(input)}<main id="main-content" class="min-w-0 overflow-x-clip pb-[max(3.5rem,var(--status-bar-height,0px),var(--mobile-dock-height,0px))]" tabindex="-1"><div class="relative bg-background text-foreground"><div class="fixed inset-0 z-0" aria-hidden="true">${
    broadcast
      ? `<div class="pointer-events-none absolute inset-0" style="background:radial-gradient(circle at 60% 48%, rgba(${era.id === "2027" ? "34, 170, 220" : "37, 99, 235"}, ${era.id === "2027" ? 0.14 : 0.18}), rgba(${era.id === "2027" ? "34, 170, 220" : "37, 99, 235"}, 0.05) 34%, transparent 56%)"></div>`
      : ""
  }<div id="globe-box" data-globe-src="${esc(input.islands.globe)}" class="absolute left-[60%] top-[48%] h-[130vmax] w-[130vmax] -translate-x-1/2 -translate-y-1/2">${input.posterBase ? poster(input.posterBase) : ""}</div><div class="pointer-events-none absolute inset-0 bg-[radial-gradient(125%_125%_at_68%_42%,transparent_38%,var(--background)_86%)]"></div><div class="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-background via-background/70 to-transparent sm:w-3/4 lg:w-3/5"></div><div class="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background"></div></div><div id="top" class="pointer-events-none relative z-10 flex h-[100svh] min-h-[560px] flex-col justify-center ${
    broadcast ? "pb-[calc(12vh+1.5rem)]" : ""
  }"><div class="pointer-events-auto mx-auto w-full max-w-7xl px-5 sm:px-8"><div class="max-w-xl">${launchBlock(input)}${headline(input)}<p class="mt-5 max-w-lg ${
    broadcast
      ? "text-base leading-relaxed text-white/70 sm:text-[1.0625rem]"
      : "text-body-lg leading-relaxed text-muted"
  }">${esc(era.heroDek)}</p>${explainer}<div class="mt-7 flex flex-wrap items-center gap-3"><a href="/register" class="${PRIMARY_BUTTON}">${esc(t("landing.signUp"))}<span aria-hidden="true">→</span></a><a href="/login" class="${SECONDARY_BUTTON}">${esc(t("landing.signIn"))}</a><a href="/world" class="${SECONDARY_BUTTON}">${esc(t("landing.explore"))}</a></div></div></div><div class="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1.5"><span class="text-body-sm font-medium text-muted">${esc(t("landing.scrollCue"))}</span><span class="block h-5 w-[1px] bg-muted/60" aria-hidden="true"></span></div>${tierKey(input)}</div><div class="relative z-10 -mt-[12vh] rounded-t-[2rem] border-t border-card-border bg-background shadow-[0_-24px_60px_-12px_rgba(0,0,0,0.45)]"><div class="flex justify-center pt-3"><span class="h-1.5 w-12 rounded-full bg-muted/40" aria-hidden="true"></span></div><section id="play" class="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">${sectionHeading(t("landing.hallsOfPower"))}<p class="mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">${esc(era.playSectionDek)}</p><ul class="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">${tiles}</ul>${rosterSection(input)}</section><section class="border-t border-card-border"><div class="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">${sectionHeading(t("landing.worldInYear", { year: era.year }))}<p class="mb-8 mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">${esc(hasBriefs ? t("landing.carouselDekBriefs") : t("landing.carouselDek"))}</p><div class="flex gap-4 overflow-x-auto overflow-y-hidden pb-4 pt-1 scrollbar-hide snap-x">${cards}</div></div></section><section class="border-t border-card-border"><div class="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">${sectionHeading(t("landing.learnHeading"))}<p class="mt-2 max-w-2xl text-body-lg leading-relaxed text-muted">${esc(t("landing.learnDek"))}</p><ul class="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">${learn}</ul></div></section>${communitySection(input)}<section class="border-t border-card-border"><div class="mx-auto max-w-7xl px-5 py-16 text-center sm:px-8 sm:py-24"><h2 class="text-heading-lg font-semibold tracking-tight text-foreground sm:text-display">${esc(era.closingHeadline)}</h2><p class="mx-auto mt-3 max-w-xl text-body-lg text-muted">${esc(era.closingDek)}</p><div class="mt-8 flex flex-wrap items-center justify-center gap-3"><a href="/register" class="${PRIMARY_BUTTON}">${esc(era.closingCta)}<span aria-hidden="true">→</span></a><a href="${ANDROID_BETA_APK_URL}" download target="_blank" rel="noopener noreferrer" class="${GHOST_BUTTON}">${esc(t("landing.getApp"))}<span aria-hidden="true">↓</span></a></div></div></section><section class="border-t border-card-border"><div class="mx-auto max-w-7xl px-5 py-12 sm:px-8">${sectionHeading(t("landing.tray.heading"))}<p class="mb-6 mt-2 max-w-2xl text-body leading-relaxed text-muted">${esc(t("landing.tray.dek"))}</p><nav aria-label="${esc(t("landing.tray.navLabel"))}" class="flex flex-wrap gap-x-6 gap-y-2 text-body">${tray}</nav></div></section><footer class="border-t border-card-border bg-card-muted/30"><div class="mx-auto max-w-7xl px-5 py-10 sm:px-8"><nav aria-label="${esc(t("landing.footer.navLabel"))}" class="mx-auto mb-8 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-10 text-left sm:grid-cols-4">${footer}</nav></div><div class="mx-auto max-w-7xl border-t border-card-border/60 px-5 py-8 text-center sm:px-8"><p class="text-body-sm text-muted">${esc(era.footerTagline)}</p><a href="https://lakesidegames.net" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex items-center gap-2 text-body-sm text-muted transition-colors hover:text-foreground"><img src="/lakeside-mark.svg" alt="Lakeside Games" width="20" height="20" class="opacity-80"/><span>${esc(t("landing.byLakeside"))}</span></a><p class="mx-auto mt-3 max-w-3xl text-body-xs leading-relaxed text-muted">${esc(t("landing.attribution"))}</p></div></footer></div></div></main>${cookieBanner()}<script type="application/json" id="landing-config">${config}</script><script>${GLOBE_LOADER}</script><script src="${esc(input.islands.countdown)}" defer></script><script src="${esc(input.islands.consent)}" defer></script></body></html>`;
}
