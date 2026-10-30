/**
 * Sidebar widgets (experimental). A widget is placed by key: its id, plus an
 * optional parameter after a colon, e.g. `stockTicker:nyse`. The same widget
 * can sit in the side tray and in a desktop menu panel.
 */

export const WIDGET_IDS = [
  "myCompany",
  "stockTicker",
  "staffQueues",
  "myRace",
  "chamberFloor",
  "officeDashboard",
  "sinceAway",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

/** Desktop menus that can hold one widget in their side column. */
export const WIDGET_MENUS = ["state", "nation", "world", "help", "staff"] as const;
export type WidgetMenu = (typeof WIDGET_MENUS)[number];

/** Ticker scopes: the world, the player's home exchange, or a named exchange. */
export const TICKER_HOME_SCOPE = "home";

export interface WidgetAudience {
  hasCorporation: boolean;
  isStaff: boolean;
  /** Standing in an open race. */
  isCandidate?: boolean;
  /** Holds a voting seat in the national legislature. */
  isLegislator?: boolean;
  /** Regional executive, cabinet member, or head of state or government. */
  holdsOffice?: boolean;
}

/** Role widgets whose availability the server confirms by returning data. */
export const SERVER_CHECKED_WIDGETS = ["chamberFloor", "officeDashboard"] as const;

export interface WidgetDefinition {
  id: WidgetId;
  /** Whether this player can use it at all. Hidden widgets are never offered. */
  available: (audience: WidgetAudience) => boolean;
  /** Parameters offered in the picker. Empty means the widget takes none. */
  params: string[];
}

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  myCompany: { id: "myCompany", available: (a) => a.hasCorporation, params: [] },
  stockTicker: { id: "stockTicker", available: () => true, params: ["global", TICKER_HOME_SCOPE] },
  staffQueues: { id: "staffQueues", available: (a) => a.isStaff, params: [] },
  myRace: { id: "myRace", available: (a) => a.isCandidate === true, params: [] },
  chamberFloor: { id: "chamberFloor", available: (a) => a.isLegislator === true, params: [] },
  officeDashboard: { id: "officeDashboard", available: (a) => a.holdsOffice === true, params: [] },
  sinceAway: { id: "sinceAway", available: () => true, params: [] },
};

export const MAX_TRAY_WIDGETS = 8;
export const WIDGET_KEY_PATTERN = /^[A-Za-z]+(?::[a-z0-9-]{1,24})?$/;

export function parseWidgetKey(key: string): { id: WidgetId; param: string | null } | null {
  if (!WIDGET_KEY_PATTERN.test(key)) return null;
  const [id, param = null] = key.split(":") as [string, string?];
  if (!(WIDGET_IDS as readonly string[]).includes(id)) return null;
  const definition = WIDGETS[id as WidgetId];
  // Parameterless widgets take none; the rest need one.
  if ((param === null) !== (definition.params.length === 0)) return null;
  return { id: id as WidgetId, param };
}

export interface WidgetLayout {
  /** Tray widgets in display order. */
  tray: string[];
  /** One widget per desktop menu. */
  nav: Partial<Record<WidgetMenu, string>>;
}

/** Saved layout, cleaned of unknown keys. Null when the player never customised. */
export function widgetLayout(value: unknown): WidgetLayout | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { tray?: unknown; nav?: unknown };
  const tray = Array.isArray(raw.tray)
    ? [
        ...new Set(
          raw.tray.filter((key): key is string => typeof key === "string" && !!parseWidgetKey(key))
        ),
      ].slice(0, MAX_TRAY_WIDGETS)
    : [];
  const nav: WidgetLayout["nav"] = {};
  if (raw.nav && typeof raw.nav === "object") {
    for (const menu of WIDGET_MENUS) {
      const key = (raw.nav as Record<string, unknown>)[menu];
      if (typeof key === "string" && parseWidgetKey(key)) nav[menu] = key;
    }
  }
  return { tray, nav };
}

/** Starting layout for a player who has not customised, by what they can use. */
export function defaultWidgetLayout(audience: WidgetAudience): WidgetLayout {
  const tray = [
    ...(audience.holdsOffice ? ["officeDashboard"] : []),
    ...(audience.isCandidate ? ["myRace"] : []),
    ...(audience.hasCorporation ? ["myCompany"] : []),
    `stockTicker:${TICKER_HOME_SCOPE}`,
    ...(audience.isStaff ? ["staffQueues"] : []),
  ];
  return {
    tray,
    nav: {
      world: "stockTicker:global",
      ...(audience.isStaff ? { staff: "staffQueues" } : {}),
    },
  };
}

/** Saved or default layout with every key the player can no longer use removed. */
export function effectiveWidgetLayout(saved: unknown, audience: WidgetAudience): WidgetLayout {
  const layout = widgetLayout(saved) ?? defaultWidgetLayout(audience);
  const usable = (key: string) => {
    const parsed = parseWidgetKey(key);
    return !!parsed && WIDGETS[parsed.id].available(audience);
  };
  return {
    tray: layout.tray.filter(usable),
    nav: Object.fromEntries(
      Object.entries(layout.nav).filter(([, key]) => !!key && usable(key))
    ) as WidgetLayout["nav"],
  };
}
