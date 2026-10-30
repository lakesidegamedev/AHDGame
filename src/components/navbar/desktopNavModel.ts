import type { PixelNavIconName } from "./PixelNavIcon";

export interface DesktopNavLink {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  external?: boolean;
  disabled?: boolean;
  parentId?: string;
  description?: string;
  icon?: PixelNavIconName;
}

export interface DesktopNavGroup {
  id: string;
  label: string;
  items: DesktopNavLink[];
}

export interface DesktopNavMenu {
  title: string;
  overview: DesktopNavLink;
  groups: DesktopNavGroup[];
  shortcuts: DesktopNavLink[];
}

// Ranked from authenticated desktop page views in October 2026. Keep the order
// stable between releases without changing the shared mobile navigation.
// Personal destinations lead; nested destinations stay directly after their parent.
const PRIORITY = [
  "myCorporation",
  "subsidiaryGroup",
  "stateParty",
  "myParty",
  "activeElection",
  "presidentialElection",
  "map",
  "myUnion",
  "cabinetOffice",
  "justiceOffice",
  "governorOffice",
  "stockMarket",
  "legislature",
  "parties",
  "elections",
  "centralBank",
  "banking",
  "executive",
  "politicians",
  "economy",
  "unions",
  "nations",
  "overview",
  "sectors",
  "budget",
  "news",
  "forex",
  "trade",
  "governmentContracts",
  "imf",
  "policy",
  "politicalMetrics",
  "metrics",
  "scotus",
  "internationalOrgs",
  "crises",
  "conflicts",
];

export function rankDesktopLinks(items: DesktopNavLink[]): DesktopNavLink[] {
  const rank = (id: string) => {
    const index = PRIORITY.indexOf(id);
    return index < 0 ? PRIORITY.length : index;
  };
  const sorted = [...items].sort((a, b) => rank(a.parentId ?? a.id) - rank(b.parentId ?? b.id));
  const roots = sorted.filter(
    (item) => !item.parentId || !items.some((p) => p.id === item.parentId)
  );
  return roots.flatMap((item) => [item, ...sorted.filter((child) => child.parentId === item.id)]);
}

export function pixelIconForLink(id: string): PixelNavIconName {
  // Staff links are keyed by their message id.
  if (id.startsWith("menus.staff.")) return /docs/i.test(id) ? "book" : "gear";
  if (/orporation|subsidiary|sectors|[Oo]ffice/.test(id)) return "briefcase";
  if (/[Ee]lection|presidential/.test(id)) return "vote";
  if (/[Pp]arty|parties|charters/.test(id)) return "flag";
  if (/bank|Bank|forex|imf/.test(id)) return "bank";
  if (/conomy|metrics|Metrics|Market/.test(id)) return "chart";
  if (/policy|budget|ontract/.test(id)) return "bill";
  if (/legislature|executive|overview/.test(id)) return "capitol";
  if (/scotus|justice/.test(id)) return "scales";
  if (/map|state/.test(id)) return "map";
  if (/nations|international|trade/.test(id)) return "globe";
  if (/union|Union|politician/.test(id)) return "people";
  if (/crises|conflicts/.test(id)) return "bolt";
  return "book";
}
