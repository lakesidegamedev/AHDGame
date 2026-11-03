import { describe, expect, it } from "vitest";
import en from "../../../messages/en/nav.json";
import de from "../../../messages/de/nav.json";
import { buildCampaignNavItems, buildCampaignNavMenu, isCampaignNavActive } from "./campaignNav";

const t = (key: string) =>
  key.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], en.nav) as string;

describe("campaign nav", () => {
  it("offers exactly Actions and Campaign Manager", () => {
    expect(buildCampaignNavItems(t).map((i) => [i.label, i.href])).toEqual([
      ["Actions", "/actions"],
      ["Campaign Manager", "/campaign-manager"],
    ]);
  });

  it("is active on either page and nowhere else", () => {
    expect(isCampaignNavActive("/actions")).toBe(true);
    expect(isCampaignNavActive("/actions/poll")).toBe(true);
    expect(isCampaignNavActive("/campaign-manager")).toBe(true);
    expect(isCampaignNavActive("/campaign/abc")).toBe(false);
    expect(isCampaignNavActive("/elections")).toBe(false);
  });

  it("builds the dock sheet menu from the same two entries", () => {
    const menu = buildCampaignNavMenu(t);
    const hrefs = [menu.overview, ...menu.groups.flatMap((g) => g.items)].map((i) => i.href);
    expect(hrefs).toEqual(["/actions", "/campaign-manager"]);
  });

  it("is translated in every locale", () => {
    expect(Object.keys(de.nav.campaignMenu).sort()).toEqual(
      Object.keys(en.nav.campaignMenu).sort()
    );
    for (const v of [
      ...Object.values(en.nav.campaignMenu),
      ...Object.values(de.nav.campaignMenu),
    ]) {
      expect(v).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
