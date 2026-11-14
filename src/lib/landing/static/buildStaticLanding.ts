import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/auth";
import { publicPageMetadata, SITE_BRAND, DEFAULT_SITE_DESCRIPTION } from "@/lib/siteMetadata";
import { getCachedLandingData } from "@/lib/landing/cachedLandingData";
import { ANNOUNCED_2027_LAUNCH, resolveLaunchSchedule } from "@/lib/landing/rules/launchSchedule";
import { formatNationList, nationKeywords, toEraId } from "@/lib/marketing/marketedWorld";
import { getMarketedWorldSafe } from "@/lib/marketing/marketedWorldServer";
import { backgroundMacroFeatureIdsForPreset } from "@/lib/world/worldEntityMap";
import { buildGovernmentTypeMap } from "@/lib/landing/governmentTypeMap";
import { fetchDiscordInviteStats } from "@/lib/discord/inviteStats";
import { getEraConfig } from "@/components/landing/eraThemes";
import { getEraFlavorCards } from "@/components/landing/flavorCards";
import { globePosterBase } from "@/components/landing/globePosters";
import { CDN_LOGO_URL } from "@/lib/images/cdnStaticUrls";
import { buildGlobeConfig } from "./globeConfig";
import { renderLandingHtml, type Translate } from "./renderLanding";
import { STATIC_LANDING_CSS } from "./staticLandingCss.generated";
import { LANDING_ISLANDS } from "./islandManifest.generated";

/** The whole signed-out landing page, from the same data the app page reads. */
export async function buildStaticLandingHtml(now: Date = new Date()): Promise<string> {
  const user = await getAuthUser();
  if (user) redirect("/profile");

  const [snapshot, discordStats, world, t, tNav, tLayout, locale] = await Promise.all([
    getCachedLandingData().catch(() => null),
    fetchDiscordInviteStats().catch(() => null),
    getMarketedWorldSafe(),
    getTranslations("auth"),
    getTranslations("nav"),
    getTranslations("layout"),
    getLocale(),
  ]);

  const seedYear = snapshot?.seedYear ?? 1979;
  const currentYear = snapshot?.currentYear ?? seedYear;
  const playerCounts = snapshot?.playerCounts ?? {};
  const governmentTypes = snapshot?.governmentTypes ?? buildGovernmentTypeMap();
  const eraId = toEraId(seedYear);
  const era = getEraConfig(seedYear);
  const macroIds = backgroundMacroFeatureIdsForPreset(`${eraId}-default`);
  const launch = snapshot
    ? resolveLaunchSchedule(
        snapshot.launch,
        now.getTime(),
        eraId === "2027" ? ANNOUNCED_2027_LAUNCH : null
      )
    : null;

  const title = t("landing.metaTitle");
  const description = t("landing.metaDescription", { countries: formatNationList(world.playable) });
  const metadata = publicPageMetadata({ title, description, pathname: "/" });
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

  return renderLandingHtml({
    t: t as unknown as Translate,
    labels: {
      contests: tNav("common.contests"),
      help: tNav("common.help"),
      signIn: tNav("common.signIn"),
      register: tNav("common.register"),
      skip: tLayout("skipToMainContent"),
    },
    macroSimulated: macroIds.length > 0,
    locale,
    era,
    world,
    launch,
    currentYear,
    government: Object.fromEntries(
      Object.entries(governmentTypes).map(([id, type]) => [id, type === "onePartyState"])
    ),
    crises: snapshot?.crises ?? [],
    discord: discordStats,
    flavorCards: getEraFlavorCards(seedYear),
    posterBase: globePosterBase(era.id, now),
    globe: buildGlobeConfig(era, new Set(macroIds), playerCounts),
    meta: {
      title,
      description,
      keywords,
      canonical: String(metadata.alternates?.canonical ?? ""),
      siteName: SITE_BRAND,
      ogImage: CDN_LOGO_URL,
      jsonLd: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: SITE_BRAND,
        description: DEFAULT_SITE_DESCRIPTION,
        applicationCategory: "Game",
        operatingSystem: "Web",
      }),
    },
    css: STATIC_LANDING_CSS,
    islands: LANDING_ISLANDS,
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? null,
    gameVersion: world.version,
  });
}
