import { pixelIconForLink, type DesktopNavLink } from "@/components/navbar/desktopNavModel";
import {
  DOCK_MORE_ICON_GRID,
  type DockIconSpec,
  type DockSectionSpec,
  type DockSheetKey,
  type MobileDockSpec,
} from "@/components/navbar/mobileDockBuilder";
import { pixelNavIconGrid, type PixelNavIconName } from "@/components/navbar/PixelNavIcon";

export interface MobileDockIcon {
  name: string;
  /** 11 rows of 11 characters, "1" for a filled pixel. */
  grid: readonly string[];
}

export interface MobileDockLink {
  id: string;
  label: string;
  href: string;
  icon?: MobileDockIcon;
  description?: string;
  /** Opens outside the game (wiki, Discord, mail). */
  external?: true;
}

export interface MobileDockSection {
  id: string;
  title: string;
  links: MobileDockLink[];
}

export interface MobileDockPayload {
  version: 1;
  tabs: {
    id: string;
    label: string;
    /** Optional label for a narrow native tab; clients fall back to `label`. */
    shortLabel?: string;
    icon: MobileDockIcon;
    href?: string;
    sheet?: DockSheetKey;
    activePrefixes: string[];
  }[];
  sheets: Partial<Record<DockSheetKey, { title: string; sections: MobileDockSection[] }>>;
}

export const MOBILE_DOCK_PAYLOAD_VERSION = 1;

const pixel = (name: PixelNavIconName): MobileDockIcon => ({
  name,
  grid: pixelNavIconGrid(name),
});

function iconFor(icon: DockIconSpec): MobileDockIcon {
  if (icon.kind === "grid") return { name: "apps", grid: DOCK_MORE_ICON_GRID };
  return pixel(icon.kind === "flag" ? "flag" : icon.name);
}

function linkFor(item: DesktopNavLink): MobileDockLink | null {
  // Rows that run code in the web page (quick suggest) have nothing to open here.
  if (!item.href || item.disabled) return null;
  return {
    id: item.id,
    label: item.label,
    href: item.href,
    icon: pixel(item.icon ?? pixelIconForLink(item.id)),
    ...(item.description ? { description: item.description } : {}),
    ...(item.external ? { external: true as const } : {}),
  };
}

function sectionsFor(section: DockSectionSpec): MobileDockSection[] {
  const { menu } = section;
  const make = (id: string, title: string, items: DesktopNavLink[]): MobileDockSection[] => {
    const links = items.flatMap((item) => linkFor(item) ?? []);
    return links.length ? [{ id: `${section.id}:${id}`, title, links }] : [];
  };
  return [
    ...make("overview", section.title ?? menu.title, [menu.overview]),
    ...make("shortcuts", section.shortcutsLabel, menu.shortcuts),
    ...menu.groups.flatMap((group) => make(group.id, group.label, group.items)),
  ];
}

/** The dock spec as the JSON the phone app draws natively. */
export function mobileDockPayload(spec: MobileDockSpec): MobileDockPayload {
  const sheets: MobileDockPayload["sheets"] = {};
  for (const key of ["state", "nation", "more"] as const) {
    const sheet = spec.sheets[key];
    if (!sheet) continue;
    const switcher: MobileDockSection[] = sheet.switchCountries
      ? [
          {
            id: "switch-country",
            title: sheet.switchLabel,
            links: sheet.switchCountries.map((option) => ({
              id: `country:${option.country}`,
              label: option.label,
              href: option.href,
              icon: pixel("flag"),
            })),
          },
        ]
      : [];
    sheets[key] = {
      title: sheet.title,
      sections: [...switcher, ...sheet.sections.flatMap(sectionsFor)],
    };
  }
  return {
    version: MOBILE_DOCK_PAYLOAD_VERSION,
    tabs: spec.tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      ...(tab.shortLabel ? { shortLabel: tab.shortLabel } : {}),
      icon: iconFor(tab.icon),
      ...(tab.href ? { href: tab.href } : {}),
      ...(tab.sheet ? { sheet: tab.sheet } : {}),
      activePrefixes: tab.activePrefixes,
    })),
    sheets,
  };
}
