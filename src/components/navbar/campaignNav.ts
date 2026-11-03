import type { DesktopNavLink, DesktopNavMenu } from "./desktopNavModel";

/**
 * The Campaign tab, in the slot Actions used to hold: the player's own Actions
 * and the Campaign Manager. Every navbar (classic, experimental, mobile menu,
 * dock) builds its entries here so they cannot drift apart.
 */

type T = (key: string) => string;

const HREFS = ["/actions", "/campaign-manager"] as const;

/** Path-boundary match, like the other nav tabs: `/actions/poll` counts, `/campaign/x` does not. */
export function isCampaignNavActive(pathname: string): boolean {
  return HREFS.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function buildCampaignNavItems(
  t: T
): Array<Required<Pick<DesktopNavLink, "id" | "label" | "href" | "description" | "icon">>> {
  return [
    {
      id: "actions",
      label: t("campaignMenu.actions"),
      href: "/actions",
      description: t("campaignMenu.actionsNote"),
      icon: "bolt",
    },
    {
      id: "campaignManager",
      label: t("campaignMenu.manager"),
      href: "/campaign-manager",
      description: t("campaignMenu.managerNote"),
      icon: "vote",
    },
  ];
}

/** The dock sheet form: Actions as the wide card, the Campaign Manager below it. */
export function buildCampaignNavMenu(t: T): DesktopNavMenu {
  const [actions, manager] = buildCampaignNavItems(t);
  return {
    title: t("campaignMenu.label"),
    overview: actions,
    groups: [{ id: "campaign", label: t("campaignMenu.label"), items: [manager] }],
    shortcuts: [],
  };
}
