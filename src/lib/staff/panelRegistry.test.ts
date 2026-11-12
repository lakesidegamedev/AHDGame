import { describe, expect, it } from "vitest";
import {
  AREAS,
  TOOLS,
  defaultToolFor,
  findTool,
  legacyRedirect,
  navFor,
  toolForLegacy,
  toolPath,
} from "./panelRegistry";

// Every tab:sub the retired admin panel exposed, frozen here so the parity
// check outlives the old config files. An empty sub means the tab had none.
const OLD_ADMIN = [
  "dashboard:",
  "traffic:",
  "politics:elections",
  "politics:parties",
  "politics:legislation",
  "politics:law-types",
  "world:demographics",
  "world:npps",
  "world:politicians",
  "world:crises",
  "world:german-question",
  "world:events",
  "world:countries",
  "world:conflicts",
  "economy:central-banks",
  "economy:inflation",
  "economy:command-economy",
  "economy:stock-market",
  "economy:forex",
  "economy:corporations",
  "economy:labour",
  "economy:market",
  "economy:bonds",
  "economy:commodities",
  "economy:resource-capacity",
  "economy:extraction",
  "economy:budgets",
  "economy:npp-economy",
  "economy:index-funds",
  "economy:financial-ledger",
  "economy:sector-seed",
  "players:users",
  "players:resources",
  "players:achievements",
  "players:characters",
  "players:patreon",
  "players:banner-ads",
  "players:activity-log",
  "players:suspicious",
  "players:alts",
  "players:forensics",
  "players:dossier",
  "players:watchlist",
  "players:moderators",
  "players:mod-audit-log",
  "players:ip-bans",
  "players:api-keys",
  "players:api-abuse",
  "content:wiki",
  "content:wiki-review",
  "content:roadmap",
  "support:suggestions",
  "support:feedback",
  "support:logs",
  "support:debug",
  "support:migrations",
  "support:mail-reports",
  "support:player-reports",
  "support:poll-banner",
  "system:seed",
  "system:universal-seeder",
  "system:reset",
  "system:post-reset",
  "system:heal",
  "system:game-health",
  "system:code-quality",
  "system:integrations",
  "system:observability",
];

// Same for the retired moderator panel.
const OLD_MOD = [
  "priority:",
  "players:users",
  "players:achievements",
  "players:characters",
  "players:patreon",
  "players:activity-log",
  "players:suspicious",
  "players:audit-log",
  "transactions:",
  "content:news",
  "content:banner-ads",
  "content:wiki",
  "content:wiki-review",
  "content:supporter-requests",
  "content:mail-reports",
  "content:player-reports",
  "site:",
];

function split(entry: string): [string, string] {
  const [tab, sub] = entry.split(":");
  return [tab!, sub ?? ""];
}

describe("panel registry parity", () => {
  it("has unique tool ids that all sit in a known area", () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const areas = new Set(AREAS.map((a) => a.id));
    for (const t of TOOLS) expect(areas.has(t.area)).toBe(true);
  });

  it.each(OLD_ADMIN)("maps old admin %s to a tool that claims it", (entry) => {
    const [tab, sub] = split(entry);
    const tool = TOOLS.find(
      (t) => t.legacy?.admin?.tab === tab && (t.legacy.admin.sub ?? "") === sub
    );
    expect(tool, `no tool claims admin ${entry}`).toBeDefined();
    expect(toolForLegacy("admin", tab, sub || null)?.id).toBe(tool!.id);
  });

  it.each(OLD_MOD)("maps old moderator %s to a tool that claims it", (entry) => {
    const [tab, sub] = split(entry);
    const tool = TOOLS.find(
      (t) => t.legacy?.moderator?.tab === tab && (t.legacy.moderator.sub ?? "") === sub
    );
    expect(tool, `no tool claims moderator ${entry}`).toBeDefined();
    expect(tool!.tier).toBe("moderator");
  });
});

describe("role visibility", () => {
  const ids = (role: Parameters<typeof navFor>[0]) =>
    navFor(role).flatMap((g) => g.tools.map((t) => t.id));

  it("gives admins and junior devs every tool", () => {
    expect(ids("admin")).toHaveLength(TOOLS.length);
    expect(ids("junior_dev")).toHaveLength(TOOLS.length);
  });

  it("gives moderators exactly the tools the old moderator panel had", () => {
    const expected = OLD_MOD.map((e) => split(e)).length;
    const modTools = ids("moderator");
    expect(modTools.every((id) => findTool(id)!.tier === "moderator")).toBe(true);
    for (const entry of OLD_MOD) {
      const [tab, sub] = split(entry);
      const tool = TOOLS.find(
        (t) => t.legacy?.moderator?.tab === tab && (t.legacy.moderator.sub ?? "") === sub
      );
      expect(modTools).toContain(tool!.id);
    }
    expect(modTools.length).toBe(expected);
  });

  it("hides admin-only tools from moderators and everything from players", () => {
    for (const hidden of ["resources", "staff-roles", "seed", "reset", "heal", "logs"]) {
      expect(ids("moderator")).not.toContain(hidden);
    }
    expect(navFor(null)).toEqual([]);
  });

  it("lands each role on a tool it can see", () => {
    expect(defaultToolFor("moderator")?.id).toBe("priority");
    expect(defaultToolFor("admin")?.id).toBe("dashboard");
    expect(defaultToolFor("junior_dev")?.id).toBe("dashboard");
    expect(defaultToolFor(null)).toBeUndefined();
  });
});

describe("legacyRedirect", () => {
  const go = (panel: "admin" | "moderator", path: string, qs = "") =>
    legacyRedirect(panel, path, new URLSearchParams(qs));

  it("sends the bare panel roots to the control panel", () => {
    expect(go("admin", "/admin")).toBe("/control");
    expect(go("moderator", "/moderator")).toBe("/control");
  });

  it("keeps deep links: tab and sub map to the tool, other params carry over", () => {
    expect(go("admin", "/admin", "tab=players&sub=users")).toBe("/control/players/users");
    expect(go("admin", "/admin", "tab=system&sub=heal&heal=elections")).toBe(
      "/control/system/heal?heal=elections"
    );
    expect(go("admin", "/admin", "tab=support&sub=suggestions&issue=42")).toBe(
      "/control/support/suggestions?issue=42"
    );
    expect(go("admin", "/admin", "tab=players&sub=dossier&user=abc")).toBe(
      "/control/players/dossier?user=abc"
    );
  });

  it("opens a tab's default tool when the sub is missing", () => {
    expect(go("admin", "/admin", "tab=economy")).toBe("/control/economy/central-banks");
    expect(go("moderator", "/moderator", "tab=content")).toBe("/control/community/news");
  });

  it("resolves the names the old admin panel already aliased", () => {
    expect(go("admin", "/admin", "tab=elections")).toBe("/control/politics/elections");
    expect(go("admin", "/admin", "tab=party-org")).toBe("/control/politics/parties");
  });

  it("maps moderator tab and sub, including renamed ones", () => {
    expect(go("moderator", "/moderator", "tab=players&sub=audit-log")).toBe(
      "/control/safety/mod-audit-log"
    );
    expect(go("moderator", "/moderator", "tab=transactions")).toBe(
      "/control/economy/financial-ledger"
    );
    expect(go("moderator", "/moderator", "tab=site")).toBe("/control/system/site-controls");
    expect(go("moderator", "/moderator", "tab=content&sub=mail-reports")).toBe(
      "/control/support/mail-reports"
    );
  });

  it("maps the standalone admin and moderator pages", () => {
    expect(go("admin", "/admin/tasks", "task=7")).toBe("/control/overview/tasks?task=7");
    expect(go("admin", "/admin/setup")).toBe("/control/system/post-reset");
    expect(go("admin", "/admin/position-editor")).toBe("/control/world/position-editor");
    expect(go("admin", "/admin/position-editor/US/CA", "era=1953")).toBe(
      "/control/world/position-editor/US/CA?era=1953"
    );
    expect(go("admin", "/admin/country/CN/regime")).toBe("/control/world/regime/CN");
    expect(go("moderator", "/moderator/mail-reports/abc123")).toBe(
      "/control/support/mail-reports/abc123"
    );
  });

  it("falls back to the panel root for unknown tabs and paths", () => {
    expect(go("admin", "/admin", "tab=nope")).toBe("/control");
    expect(go("admin", "/admin/unknown-page")).toBe("/control");
  });

  it("only ever produces registered tool paths", () => {
    for (const t of TOOLS) {
      const ref = t.legacy?.admin;
      if (!ref) continue;
      const out = go("admin", "/admin", `tab=${ref.tab}${ref.sub ? `&sub=${ref.sub}` : ""}`);
      expect(out).toBe(toolPath(t));
    }
  });
});
