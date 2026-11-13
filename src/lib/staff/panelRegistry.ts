/**
 * The control panel's tool catalogue: what exists, where it lives, who sees it.
 *
 * Pure data. Components, route pages, the nav, the command palette and the
 * legacy-URL redirects all read this one list, so a tool is added or hidden in
 * exactly one place. Rendering lives in `src/components/control/toolBodies`.
 */
import { canViewTier, type StaffRole, type ToolTier } from "./rules";

export type AreaId =
  | "overview"
  | "players"
  | "safety"
  | "community"
  | "support"
  | "politics"
  | "world"
  | "economy"
  | "system"
  | "diagnostics";

export interface AreaDef {
  id: AreaId;
  label: string;
}

/** Display order of the nav. */
export const AREAS: readonly AreaDef[] = [
  { id: "overview", label: "Overview" },
  { id: "players", label: "Players" },
  { id: "safety", label: "Safety and access" },
  { id: "community", label: "Content and community" },
  { id: "support", label: "Support and reports" },
  { id: "politics", label: "Politics" },
  { id: "world", label: "World" },
  { id: "economy", label: "Economy" },
  { id: "system", label: "System" },
  { id: "diagnostics", label: "Diagnostics" },
];

/** A tool's location in the retired admin or moderator panel. */
export interface LegacyRef {
  tab: string;
  sub?: string;
}

export interface ToolDef {
  /** Unique across the panel; also the last path segment. */
  id: string;
  area: AreaId;
  label: string;
  /** "moderator" tools are visible to moderators; "admin" tools are not. */
  tier: ToolTier;
  keywords?: string;
  legacy?: { admin?: LegacyRef; moderator?: LegacyRef };
}

const a = (tab: string, sub?: string): LegacyRef => ({ tab, sub });

export const TOOLS: readonly ToolDef[] = [
  // Overview
  {
    id: "priority",
    area: "overview",
    label: "Priority queue",
    tier: "moderator",
    keywords: "triage",
    legacy: { moderator: a("priority") },
  },
  {
    id: "dashboard",
    area: "overview",
    label: "Dashboard",
    tier: "admin",
    legacy: { admin: a("dashboard") },
  },
  {
    id: "traffic",
    area: "overview",
    label: "Traffic",
    tier: "admin",
    legacy: { admin: a("traffic") },
  },
  { id: "tasks", area: "overview", label: "Tasks", tier: "admin", keywords: "bugs todo" },

  // Players
  {
    id: "users",
    area: "players",
    label: "Users",
    tier: "moderator",
    keywords: "accounts ban",
    legacy: { admin: a("players", "users"), moderator: a("players", "users") },
  },
  {
    id: "resources",
    area: "players",
    label: "Grant resources",
    tier: "admin",
    keywords: "money funds actions",
    legacy: { admin: a("players", "resources") },
  },
  {
    id: "achievements",
    area: "players",
    label: "Achievements",
    tier: "moderator",
    legacy: { admin: a("players", "achievements"), moderator: a("players", "achievements") },
  },
  {
    id: "characters",
    area: "players",
    label: "Characters",
    tier: "moderator",
    legacy: { admin: a("players", "characters"), moderator: a("players", "characters") },
  },
  {
    id: "patreon",
    area: "players",
    label: "Patreon",
    tier: "moderator",
    legacy: { admin: a("players", "patreon"), moderator: a("players", "patreon") },
  },
  {
    id: "dossier",
    area: "players",
    label: "Dossier",
    tier: "admin",
    legacy: { admin: a("players", "dossier") },
  },
  {
    id: "watchlist",
    area: "players",
    label: "Watchlist",
    tier: "admin",
    legacy: { admin: a("players", "watchlist") },
  },

  // Safety and access
  {
    id: "activity-log",
    area: "safety",
    label: "Activity log",
    tier: "moderator",
    legacy: { admin: a("players", "activity-log"), moderator: a("players", "activity-log") },
  },
  {
    id: "suspicious",
    area: "safety",
    label: "Suspicious activity",
    tier: "moderator",
    legacy: { admin: a("players", "suspicious"), moderator: a("players", "suspicious") },
  },
  {
    id: "alts",
    area: "safety",
    label: "Alt detection",
    tier: "admin",
    legacy: { admin: a("players", "alts") },
  },
  {
    id: "forensics",
    area: "safety",
    label: "Forensics",
    tier: "admin",
    legacy: { admin: a("players", "forensics") },
  },
  {
    id: "ip-bans",
    area: "safety",
    label: "IP bans",
    tier: "admin",
    legacy: { admin: a("players", "ip-bans") },
  },
  {
    id: "api-keys",
    area: "safety",
    label: "API keys",
    tier: "admin",
    legacy: { admin: a("players", "api-keys") },
  },
  {
    id: "api-abuse",
    area: "safety",
    label: "API abuse",
    tier: "admin",
    legacy: { admin: a("players", "api-abuse") },
  },
  {
    id: "mod-audit-log",
    area: "safety",
    label: "Moderator audit log",
    tier: "moderator",
    legacy: { admin: a("players", "mod-audit-log"), moderator: a("players", "audit-log") },
  },
  {
    id: "staff-roles",
    area: "safety",
    label: "Staff roles",
    tier: "admin",
    keywords: "moderators junior dev grant",
    legacy: { admin: a("players", "moderators") },
  },

  // Content and community
  {
    id: "news",
    area: "community",
    label: "News posts",
    tier: "moderator",
    legacy: { moderator: a("content", "news") },
  },
  {
    id: "banner-ads",
    area: "community",
    label: "Banner ads",
    tier: "moderator",
    legacy: { admin: a("players", "banner-ads"), moderator: a("content", "banner-ads") },
  },
  {
    id: "wiki",
    area: "community",
    label: "Wiki pages",
    tier: "moderator",
    legacy: { admin: a("content", "wiki"), moderator: a("content", "wiki") },
  },
  {
    id: "wiki-review",
    area: "community",
    label: "Wiki review",
    tier: "moderator",
    legacy: { admin: a("content", "wiki-review"), moderator: a("content", "wiki-review") },
  },
  {
    id: "supporter-requests",
    area: "community",
    label: "Supporter requests",
    tier: "moderator",
    legacy: { moderator: a("content", "supporter-requests") },
  },
  {
    id: "roadmap",
    area: "community",
    label: "Roadmap",
    tier: "admin",
    legacy: { admin: a("content", "roadmap") },
  },
  {
    id: "poll-banner",
    area: "community",
    label: "Poll banner",
    tier: "admin",
    legacy: { admin: a("support", "poll-banner") },
  },

  // Support and reports
  {
    id: "suggestions",
    area: "support",
    label: "Suggestions",
    tier: "admin",
    legacy: { admin: a("support", "suggestions") },
  },
  {
    id: "feedback",
    area: "support",
    label: "Feedback (legacy)",
    tier: "admin",
    legacy: { admin: a("support", "feedback") },
  },
  {
    id: "mail-reports",
    area: "support",
    label: "Mail reports",
    tier: "moderator",
    legacy: { admin: a("support", "mail-reports"), moderator: a("content", "mail-reports") },
  },
  {
    id: "player-reports",
    area: "support",
    label: "Player reports",
    tier: "moderator",
    legacy: { admin: a("support", "player-reports"), moderator: a("content", "player-reports") },
  },

  // Politics
  ...(
    [
      ["elections", "Elections"],
      ["parties", "Parties"],
      ["legislation", "Legislation"],
      ["law-types", "Law types"],
    ] as const
  ).map(([id, label]): ToolDef => ({
    id,
    area: "politics",
    label,
    tier: "admin",
    legacy: { admin: a("politics", id) },
  })),

  // World
  ...(
    [
      ["demographics", "Demographics"],
      ["npps", "NPPs"],
      ["politicians", "Politician profiles"],
      ["crises", "Crises"],
      ["german-question", "German question"],
      ["events", "Random events"],
      ["countries", "Countries"],
      ["conflicts", "Conflicts"],
    ] as const
  ).map(([id, label]): ToolDef => ({
    id,
    area: "world",
    label,
    tier: "admin",
    legacy: { admin: a("world", id) },
  })),
  { id: "position-editor", area: "world", label: "Position editor", tier: "admin" },

  // Economy
  ...(
    [
      ["central-banks", "Central banks"],
      ["inflation", "Inflation"],
      ["command-economy", "Command economy"],
      ["stock-market", "Stock market"],
      ["forex", "Forex"],
      ["corporations", "Corporations"],
      ["labour", "Labour"],
      ["market", "Market"],
      ["bonds", "Bonds"],
      ["commodities", "Commodities"],
      ["resource-capacity", "Resource capacity"],
      ["extraction", "Prospecting and contracts"],
      ["budgets", "Budget overview"],
      ["npp-economy", "NPP economy"],
      ["index-funds", "Index funds"],
      ["sector-seed", "Sector seed"],
    ] as const
  ).map(([id, label]): ToolDef => ({
    id,
    area: "economy",
    label,
    tier: "admin",
    legacy: { admin: a("economy", id) },
  })),
  {
    id: "grants",
    area: "economy",
    label: "Grants and adjustments",
    tier: "admin",
    keywords: "grant money funds audit accountable",
  },
  {
    id: "financial-ledger",
    area: "economy",
    label: "Financial ledger",
    tier: "moderator",
    keywords: "transactions",
    legacy: { admin: a("economy", "financial-ledger"), moderator: a("transactions") },
  },

  // System
  ...(
    [
      ["seed", "Seed database"],
      ["universal-seeder", "Universal seeder"],
      ["reset", "Game reset"],
      ["post-reset", "Post reset checklist"],
      ["heal", "Heal"],
      ["integrations", "Integrations"],
    ] as const
  ).map(([id, label]): ToolDef => ({
    id,
    area: "system",
    label,
    tier: "admin",
    legacy: { admin: a("system", id) },
  })),
  {
    id: "site-controls",
    area: "system",
    label: "Site controls",
    tier: "moderator",
    keywords: "turn pause registration",
    legacy: { moderator: a("site") },
  },

  // Diagnostics
  {
    id: "logs",
    area: "diagnostics",
    label: "Logs",
    tier: "admin",
    legacy: { admin: a("support", "logs") },
  },
  {
    id: "debug",
    area: "diagnostics",
    label: "Debug",
    tier: "admin",
    legacy: { admin: a("support", "debug") },
  },
  {
    id: "migrations",
    area: "diagnostics",
    label: "Migrations",
    tier: "admin",
    legacy: { admin: a("support", "migrations") },
  },
  {
    id: "game-health",
    area: "diagnostics",
    label: "Game health",
    tier: "admin",
    legacy: { admin: a("system", "game-health") },
  },
  {
    id: "code-quality",
    area: "diagnostics",
    label: "Code quality",
    tier: "admin",
    legacy: { admin: a("system", "code-quality") },
  },
  {
    id: "observability",
    area: "diagnostics",
    label: "Observability",
    tier: "admin",
    legacy: { admin: a("system", "observability") },
  },
];

const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function findTool(id: string): ToolDef | undefined {
  return TOOL_BY_ID.get(id);
}

export function toolPath(tool: Pick<ToolDef, "area" | "id">): string {
  return `/control/${tool.area}/${tool.id}`;
}

export function canSeeTool(role: StaffRole | null, tool: ToolDef): boolean {
  return canViewTier(role, tool.tier);
}

export interface NavGroup {
  area: AreaDef;
  tools: ToolDef[];
}

/** The nav for a role: areas in order, tools the role may see, empty areas dropped. */
export function navFor(role: StaffRole | null): NavGroup[] {
  return AREAS.map((area) => ({
    area,
    tools: TOOLS.filter((t) => t.area === area.id && canSeeTool(role, t)),
  })).filter((g) => g.tools.length > 0);
}

/** First tool a role lands on at /control. */
export function defaultToolFor(role: StaffRole | null): ToolDef | undefined {
  const preferred = role === "moderator" ? "priority" : "dashboard";
  const tool = findTool(preferred);
  return tool && canSeeTool(role, tool) ? tool : navFor(role)[0]?.tools[0];
}

export type LegacyPanel = "admin" | "moderator";

/** Legacy tab/sub to the new tool, or null when nothing matches. */
export function toolForLegacy(
  panel: LegacyPanel,
  tab: string | null | undefined,
  sub: string | null | undefined
): ToolDef | null {
  if (!tab) return null;
  const hit = (ref: LegacyRef | undefined) =>
    ref !== undefined && ref.tab === tab && (ref.sub ?? "") === (sub ?? "");
  const exact = TOOLS.find((t) => hit(t.legacy?.[panel]));
  if (exact) return exact;
  // A tab with no sub (or an unknown one) opens the tab's default tool.
  const first = TOOLS.find((t) => t.legacy?.[panel]?.tab === tab);
  return first ?? null;
}

/** Old admin tab names that were already aliases inside the old panel. */
const LEGACY_ADMIN_TAB_ALIASES: Record<string, LegacyRef> = {
  main: { tab: "dashboard" },
  game: { tab: "politics", sub: "elections" },
  "party-org": { tab: "politics", sub: "parties" },
  elections: { tab: "politics", sub: "elections" },
  legislation: { tab: "politics", sub: "legislation" },
  "law-types": { tab: "politics", sub: "law-types" },
  demographics: { tab: "world", sub: "demographics" },
  npps: { tab: "world", sub: "npps" },
  politicians: { tab: "world", sub: "politicians" },
  "central-banks": { tab: "economy", sub: "central-banks" },
  inflation: { tab: "economy", sub: "inflation" },
  "command-economy": { tab: "economy", sub: "command-economy" },
  "stock-market": { tab: "economy", sub: "stock-market" },
  forex: { tab: "economy", sub: "forex" },
  corporations: { tab: "economy", sub: "corporations" },
  bonds: { tab: "economy", sub: "bonds" },
  commodities: { tab: "economy", sub: "commodities" },
  budgets: { tab: "economy", sub: "budgets" },
  "npp-economy": { tab: "economy", sub: "npp-economy" },
  "index-funds": { tab: "economy", sub: "index-funds" },
  "financial-ledger": { tab: "economy", sub: "financial-ledger" },
  users: { tab: "players", sub: "users" },
  achievements: { tab: "players", sub: "achievements" },
  resources: { tab: "players", sub: "resources" },
  patreon: { tab: "players", sub: "patreon" },
  alts: { tab: "players", sub: "alts" },
  forensics: { tab: "players", sub: "forensics" },
  wiki: { tab: "content", sub: "wiki" },
  roadmap: { tab: "content", sub: "roadmap" },
  suggestions: { tab: "support", sub: "suggestions" },
  feedback: { tab: "support", sub: "feedback" },
  logs: { tab: "support", sub: "logs" },
  reset: { tab: "system", sub: "reset" },
  seed: { tab: "system", sub: "seed" },
  heal: { tab: "system", sub: "heal" },
};

/**
 * Where an old /admin or /moderator URL goes now.
 *
 * `search` is the old query string. tab and sub are consumed; every other
 * param (heal category, user id, issue number, filters) is carried over.
 * Returns a path plus query, always under /control.
 */
export function legacyRedirect(
  panel: LegacyPanel,
  pathname: string,
  search: URLSearchParams
): string {
  const rest = new URLSearchParams(search);
  rest.delete("tab");
  rest.delete("sub");
  const withQuery = (path: string) => {
    const q = rest.toString();
    return q ? `${path}?${q}` : path;
  };

  const segments = pathname.split("/").filter(Boolean).slice(1);
  if (segments.length > 0) {
    const [first, second, third] = segments;
    if (panel === "admin") {
      if (first === "tasks") return withQuery("/control/overview/tasks");
      if (first === "setup") return "/control/system/post-reset";
      if (first === "position-editor") {
        if (second && third) {
          return withQuery(`/control/world/position-editor/${second}/${third}`);
        }
        return withQuery("/control/world/position-editor");
      }
      if (first === "country" && second && third === "regime") {
        return withQuery(`/control/world/regime/${second}`);
      }
    }
    if (panel === "moderator" && first === "mail-reports" && second) {
      return withQuery(`/control/support/mail-reports/${second}`);
    }
    return "/control";
  }

  const rawTab = search.get("tab");
  const rawSub = search.get("sub");
  let tab = rawTab;
  let sub = rawSub;
  if (panel === "admin" && rawTab && LEGACY_ADMIN_TAB_ALIASES[rawTab]) {
    tab = LEGACY_ADMIN_TAB_ALIASES[rawTab]!.tab;
    sub = LEGACY_ADMIN_TAB_ALIASES[rawTab]!.sub ?? rawSub;
  }
  const tool = toolForLegacy(panel, tab, sub);
  if (!tool) return withQuery("/control");
  return withQuery(toolPath(tool));
}
