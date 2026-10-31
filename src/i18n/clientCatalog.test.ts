import { readFileSync } from "node:fs";
import type { AbstractIntlMessages } from "next-intl";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CLIENT_CATALOG_RULES,
  clientNamespacesForPath,
  nonShellClientMessages,
  pickClientNamespaces,
  SHELL_CLIENT_NAMESPACES,
  shouldTrimClientCatalog,
  templateNamespacesForPath,
} from "./clientCatalog";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "..", "..", "messages", "en");

const NAMESPACES = [
  "layout",
  "nav",
  "settings",
  "tutorial",
  "auth",
  "profile",
  "elections",
  "corporations",
  "worldConflicts",
  "worldOrganizations",
  "centralBank",
  "parties",
  "contests",
  "governmentConfidence",
] as const;

function englishCatalog(): AbstractIntlMessages {
  const catalog: AbstractIntlMessages = {};
  for (const file of NAMESPACES) {
    catalog[file] = JSON.parse(readFileSync(join(messagesDir, `${file}.json`), "utf8"));
  }
  return catalog;
}

describe("clientNamespacesForPath", () => {
  it("matches the route itself, its trailing slash and its children", () => {
    const expected = ["corporations", "profile", "nav", "tutorial"];
    expect(clientNamespacesForPath("/corporation/1")).toEqual(expected);
    expect(clientNamespacesForPath("/corporation/1/")).toEqual(expected);
    expect(clientNamespacesForPath("/corporation/1/sector/abc")).toEqual(expected);
  });

  it("does not match a shared prefix that is not on a path boundary", () => {
    expect(clientNamespacesForPath("/corporations")).toBeNull();
    expect(clientNamespacesForPath("/profilex")).toBeNull();
    expect(clientNamespacesForPath("/marketplace")).toBeNull();
  });

  it("leaves every unlisted route on the full catalog", () => {
    expect(clientNamespacesForPath("/admin/health")).toBeNull();
    expect(clientNamespacesForPath("/changelog/1.19.0")).toBeNull();
    expect(clientNamespacesForPath(null)).toBeNull();
    expect(clientNamespacesForPath("")).toBeNull();
  });

  it("matches a country subpage pattern and beats the family prefix", () => {
    expect(clientNamespacesForPath("/country/us/map")).toEqual(["elections", "nav", "tutorial"]);
    expect(clientNamespacesForPath("/country/us/map/")).toEqual(["elections", "nav", "tutorial"]);
    expect(clientNamespacesForPath("/country/uk/budget")).toEqual(["nav", "tutorial"]);
    expect(clientNamespacesForPath("/country/jp/legislature")).toContain("parties");
  });

  it("keeps the family union for a country page without its own rule", () => {
    const union = clientNamespacesForPath("/country/us");
    expect(union).toContain("corporations");
    expect(clientNamespacesForPath("/country/us/some-new-page")).toEqual(union);
    // A pattern only matches its own shape.
    expect(clientNamespacesForPath("/country/us/map/extra")).toEqual(union);
  });

  it("matches the landing page exactly, not as a prefix", () => {
    expect(clientNamespacesForPath("/")).toEqual(["auth", "nav", "tutorial", "worldConflicts"]);
    expect(clientNamespacesForPath("/anything-else")).toBeNull();
  });

  it("covers the highest-traffic families from the production telemetry", () => {
    for (const route of [
      "/corporation/1",
      "/profile",
      "/actions",
      "/elections/US-president",
      "/market",
      "/portfolio",
      "/world",
      "/character/abc",
      "/country/us/map",
      "/country/uk/region/CGK/legislature",
    ]) {
      expect(clientNamespacesForPath(route), route).not.toBeNull();
    }
  });
});

describe("CLIENT_CATALOG_RULES", () => {
  it("always includes the namespaces the shell renders on every page", () => {
    for (const rule of CLIENT_CATALOG_RULES) {
      for (const shellNamespace of SHELL_CLIENT_NAMESPACES) {
        expect(rule.namespaces, `${rule.prefix} must keep ${shellNamespace}`).toContain(
          shellNamespace
        );
      }
    }
  });

  it("only names real catalog namespaces", () => {
    const available = new Set<string>(NAMESPACES);
    for (const rule of CLIENT_CATALOG_RULES) {
      for (const namespace of rule.namespaces) {
        expect(
          available.has(namespace),
          `${rule.prefix} references unknown namespace ${namespace}`
        ).toBe(true);
      }
    }
  });

  it("actually trims: no route ships the whole catalog", () => {
    for (const rule of CLIENT_CATALOG_RULES) {
      expect(rule.namespaces.length, `${rule.prefix} ships everything`).toBeLessThan(
        NAMESPACES.length
      );
    }
  });
});

describe("shouldTrimClientCatalog", () => {
  it("trims mapped routes for ordinary players and anonymous visitors", () => {
    expect(shouldTrimClientCatalog("/corporation/1", { isAdmin: false })).toBe(true);
    expect(shouldTrimClientCatalog("/profile", null)).toBe(true);
    expect(shouldTrimClientCatalog("/market", undefined)).toBe(true);
  });

  it("never trims staff, who can render admin tooling on any page", () => {
    expect(shouldTrimClientCatalog("/corporation/1", { isAdmin: true })).toBe(false);
    expect(shouldTrimClientCatalog("/profile", { isModerator: true })).toBe(false);
  });

  it("never trims an unmapped route, whatever the viewer", () => {
    expect(shouldTrimClientCatalog("/changelog/1.19.0", { isAdmin: false })).toBe(false);
    expect(shouldTrimClientCatalog("/changelog/1.19.0", null)).toBe(false);
  });
});

describe("templateNamespacesForPath", () => {
  it("leaves the shell to the root layout", () => {
    expect(templateNamespacesForPath("/corporation/1", null)).toEqual(["corporations", "profile"]);
    expect(templateNamespacesForPath("/market", null)).toEqual(["corporations"]);
  });

  it("returns null for staff and for unlisted routes, meaning full minus shell", () => {
    expect(templateNamespacesForPath("/corporation/1", { isAdmin: true })).toBeNull();
    expect(templateNamespacesForPath("/changelog/1.19.0", null)).toBeNull();
  });
});

describe("pickClientNamespaces", () => {
  it("keeps only the requested namespaces and shares references", () => {
    const messages = englishCatalog();
    const picked = pickClientNamespaces(messages, ["nav", "profile"]);
    expect(Object.keys(picked).sort()).toEqual(["nav", "profile"]);
    expect(picked.profile).toBe(messages.profile);
  });

  it("does not invent a namespace the locale does not have", () => {
    expect(Object.keys(pickClientNamespaces({ nav: { a: "b" } }, ["nav", "profile"]))).toEqual([
      "nav",
    ]);
  });
});

describe("nonShellClientMessages", () => {
  it("drops exactly the shell namespaces", () => {
    const messages = englishCatalog();
    const rest = nonShellClientMessages(messages);
    for (const shellNamespace of SHELL_CLIENT_NAMESPACES) {
      expect(rest[shellNamespace]).toBeUndefined();
    }
    expect(Object.keys(rest).length).toBe(NAMESPACES.length - SHELL_CLIENT_NAMESPACES.length);
  });
});
