/**
 * Every route on the lander a signed-out visitor can actually read.
 *
 * Membership rule: the page must render real content with no session and no
 * character. That is stricter than "exports publicPageMetadata"; a page can
 * advertise itself to crawlers and still hand an anonymous visitor an empty
 * state. `/officials` and `/world/legacy` read the session only to highlight the
 * viewer's own row, so both stay in.
 *
 * The footer and drawer tray both build from this file so the lists cannot drift.
 * `publicLinks.test.ts` asserts every label key exists in every locale.
 */

import { COMMUNITY_DISCORD_URL } from "@/lib/communityLinks";

export type LandingLink = {
  href: string;
  /** Key under the `auth` next-intl namespace. */
  labelKey: string;
  /**
   * Renders as a plain `<a target="_blank">` instead of a next/link. Set it for
   * anything that leaves ahousedividedgame.com, so the tray does not eject a
   * visitor to another domain with no warning.
   */
  external?: true;
};

/** Canonical home of the public API reference since #771 retired /api-guide. */
export const API_DOCS_URL = "https://docs.lakesidegames.net/api/public-v1.html";

/** Lakeside Games' one-page overview of the 2027 world. */
export const AHD_2027_OVERVIEW_URL = "https://lakesidegames.net/ahd-2027/";

/** The State of the Game post that announced the 2027 world. */
export const STATE_OF_THE_GAME_NOVEMBER_2026_URL =
  "https://lakesidegames.net/news/state-of-the-game-november-2026/";

/** Download page for the Lakeside launcher. */
export const LAKESIDE_LAUNCHER_URL = "https://lakesidegames.net/download/";

/**
 * The lander's secondary actions beside Create your character and Sign in.
 * Every one leaves the game's domain, so every one is external.
 */
export const LANDING_WORLD_LINKS: readonly LandingLink[] = [
  { href: AHD_2027_OVERVIEW_URL, labelKey: "landing.world2027.overview", external: true },
  {
    href: STATE_OF_THE_GAME_NOVEMBER_2026_URL,
    labelKey: "landing.world2027.stateOfTheGame",
    external: true,
  },
  { href: LAKESIDE_LAUNCHER_URL, labelKey: "landing.world2027.launcher", external: true },
  { href: COMMUNITY_DISCORD_URL, labelKey: "landing.world2027.discord", external: true },
];

export type LandingFooterSection = {
  headingKey: string;
  links: readonly LandingLink[];
};

export const LANDING_FOOTER_SECTIONS: readonly LandingFooterSection[] = [
  {
    headingKey: "landing.footer.game",
    links: [
      { href: "/world", labelKey: "landing.footer.worldMap" },
      { href: "/world/trade", labelKey: "landing.footer.tradeLedger" },
      { href: "/world/cold-war-ledger", labelKey: "landing.footer.coldWarLedger" },
      { href: "/officials", labelKey: "landing.footer.officials" },
      { href: "/world/legacy", labelKey: "landing.footer.hallOfFame" },
      { href: "/news", labelKey: "landing.footer.newsWire" },
      { href: "/changelog", labelKey: "landing.footer.whatsNew" },
    ],
  },
  {
    headingKey: "landing.footer.learn",
    links: [
      { href: "/tutorial", labelKey: "landing.footer.tutorial" },
      { href: "/guides", labelKey: "landing.footer.guides" },
      { href: "/wiki", labelKey: "landing.footer.wiki" },
      { href: "/faq", labelKey: "landing.footer.faq" },
      // Link the canonical docs URL directly: the in-app route is a cross-domain redirect.
      { href: API_DOCS_URL, labelKey: "landing.footer.apiDocs", external: true },
      { href: "/about", labelKey: "landing.footer.about" },
    ],
  },
  {
    headingKey: "landing.footer.community",
    links: [
      { href: "/supporters", labelKey: "landing.footer.supporters" },
      { href: "/player-ads", labelKey: "landing.footer.advertise" },
      { href: "/register", labelKey: "landing.footer.createAccount" },
    ],
  },
  {
    headingKey: "landing.footer.legal",
    links: [
      { href: "/privacy", labelKey: "landing.footer.privacy" },
      { href: "/terms", labelKey: "landing.footer.terms" },
      { href: "/contact", labelKey: "landing.footer.contact" },
    ],
  },
] as const;

/**
 * The drawer tray. Same inventory minus the two links that are not "a page you
 * can go read": /register is already the page's primary button twice over, and
 * the legal column belongs at the bottom rather than in a browse strip.
 *
 * This exists because every bento tile on the lander points a signed-out
 * visitor at /login. Without the tray the only way off the landing page is the
 * sign-up form, even though a dozen routes are open to anyone.
 */
export const LANDING_TRAY_LINKS: readonly LandingLink[] = LANDING_FOOTER_SECTIONS.filter(
  (section) => section.headingKey !== "landing.footer.legal"
)
  .flatMap((section) => section.links)
  .filter((link) => link.href !== "/register");
