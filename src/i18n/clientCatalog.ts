import type { AbstractIntlMessages } from "next-intl";

/**
 * Per-route client message catalog.
 *
 * `getMessages()` returns every namespace, and the root layout serialises the
 * whole thing into `NextIntlClientProvider`. Measured 2026-10-24: the English
 * catalog is 239,716 bytes of JSON and 70,586 bytes gzipped, while the entire
 * `/corporation/1` document was 78,378 bytes gzipped. In other words, the
 * catalog was essentially the whole payload of every page, for a signed-out
 * visitor as much as a player.
 *
 * Two providers share the work, because the root layout does not re-render on a
 * client-side navigation:
 *
 * - The root layout ships `SHELL_CLIENT_NAMESPACES` only. The navbar and the
 *   tutorial coach mount on every route and are rendered by the layout itself,
 *   so their copy must survive navigation.
 * - `app/template.tsx` ships the rest for the current path. A template is
 *   re-created on navigation, so its provider receives the new route's namespaces
 *   (and a server bypass would otherwise keep the first page's catalog for the
 *   whole session; `scripts/perf/page-load/nav-check.mjs` guards that).
 *
 * Unlisted routes get the full catalog, so the fallback is always today's
 * behaviour rather than a broken page. Server components are unaffected: they
 * translate through `getTranslations`, which never reads the client catalog.
 *
 * How the sets are produced
 * -------------------------
 * `scripts/i18n/client-namespaces.mjs` walks static and dynamic imports from
 * the root layout plus each subtree's `page.tsx` / `layout.tsx`, and collects
 * every `useTranslations("namespace")` it can reach. The sets below are that
 * output, one union per top-level route subtree, so each rule is a superset of
 * every page under it.
 *
 * Rules of the road for editing this map
 * --------------------------------------
 * - A route that is not listed keeps the full catalog. Add an entry only after
 *   running the analyzer and sweeping the route with
 *   `scripts/perf/page-load/missing-messages.mjs`.
 * - Staff viewers are never trimmed: admin tooling can render anywhere, and
 *   missing admin strings cost more than the bytes save.
 */

/** Rendered by the root layout itself, so they must work on every route. */
export const SHELL_CLIENT_NAMESPACES = ["nav", "tutorial"] as const;

export interface ClientCatalogRule {
  /** Matched on a path boundary: `/profile` matches `/profile` and `/profile/x`. */
  prefix: string;
  /** Only the exact path matches. Used for `/`, which would otherwise match all. */
  exact?: boolean;
  /**
   * Segment pattern with `:name` placeholders, e.g. `/country/:code/map`.
   * A pattern rule beats the broader prefix rule it refines.
   */
  pattern?: string;
  /** Top-level namespaces the client tree under this prefix can translate. */
  namespaces: readonly string[];
}

export const CLIENT_CATALOG_RULES: readonly ClientCatalogRule[] = [
  // Landing page. Exact match: a bare "/" prefix would swallow every route.
  { prefix: "/", exact: true, namespaces: ["auth", "nav", "tutorial", "worldConflicts"] },

  // 67,043 views / 30 days. Covers /corporation/[id], /group, /bank and
  // /sector/[sectorId]; the sector sub-page adds corporations.sectorInvestment.
  { prefix: "/corporation", namespaces: ["corporations", "profile", "nav", "tutorial"] },
  // 14,110 views.
  { prefix: "/profile", namespaces: ["profile", "nav", "tutorial"] },
  // 6,416 views.
  { prefix: "/character", namespaces: ["profile", "nav", "tutorial"] },
  // 5,431 views.
  { prefix: "/portfolio", namespaces: ["profile", "nav", "tutorial"] },
  // 11,284 views. The action grid itself is server-rendered; its client cards
  // read the elections copy for campaign actions.
  { prefix: "/actions", namespaces: ["elections", "nav", "tutorial"] },
  // 10,305 views.
  { prefix: "/elections", namespaces: ["elections", "nav", "tutorial"] },
  // 6,244 views.
  { prefix: "/market", namespaces: ["corporations", "nav", "tutorial"] },
  // 57,368 views, the second-largest family. These per-page rules beat the
  // broad `/country` rule below: a map page does not need the corporations or
  // profile copy, and the budget/economy/forex pages need none of them.
  {
    prefix: "/country",
    pattern: "/country/:code/map",
    namespaces: ["elections", "nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/elections",
    namespaces: ["elections", "nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/legislature",
    namespaces: [
      "elections",
      "layout",
      "parties",
      "worldConflicts",
      "worldOrganizations",
      "nav",
      "tutorial",
    ],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/executive",
    namespaces: ["governmentConfidence", "profile", "nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/approval",
    namespaces: ["layout", "nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/budget",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/economy",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/metrics",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/central-bank",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/forex",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/state-ownership",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/navair",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/referendums",
    namespaces: ["nav", "tutorial"],
  },
  {
    prefix: "/country",
    pattern: "/country/:code/parties",
    namespaces: ["nav", "tutorial"],
  },
  // Everything else under /country keeps the family union.
  {
    prefix: "/country",
    namespaces: [
      "corporations",
      "elections",
      "governmentConfidence",
      "layout",
      "parties",
      "profile",
      "worldConflicts",
      "worldOrganizations",
      "nav",
      "tutorial",
    ],
  },
  // 3,464 views.
  { prefix: "/world", namespaces: ["worldConflicts", "worldOrganizations", "nav", "tutorial"] },
  // 2,989 views.
  { prefix: "/notifications", namespaces: ["nav", "tutorial"] },
  { prefix: "/banking", namespaces: ["corporations", "nav", "tutorial"] },
  { prefix: "/stockmarket", namespaces: ["corporations", "nav", "tutorial"] },
  { prefix: "/commodity", namespaces: ["corporations", "nav", "tutorial"] },
  { prefix: "/campaign", namespaces: ["elections", "nav", "tutorial"] },
  { prefix: "/centralbank", namespaces: ["centralBank", "nav", "tutorial"] },
  { prefix: "/settings", namespaces: ["settings", "nav", "tutorial"] },
  // Lists and read-only rosters: their copy is server-rendered.
  { prefix: "/congress", namespaces: ["nav", "tutorial"] },
  { prefix: "/unions", namespaces: ["nav", "tutorial"] },
  { prefix: "/politicians", namespaces: ["nav", "tutorial"] },
  { prefix: "/news", namespaces: ["nav", "tutorial"] },
  { prefix: "/guides", namespaces: ["nav", "tutorial"] },
  { prefix: "/wiki", namespaces: ["nav", "tutorial"] },
];

function matchesPattern(pattern: string, pathname: string): boolean {
  const want = pattern.split("/").filter(Boolean);
  const got = pathname.split("/").filter(Boolean);
  if (want.length !== got.length) return false;
  return want.every((segment, index) =>
    segment.startsWith(":") ? got[index].length > 0 : segment === got[index]
  );
}

/** Specificity score: exact beats pattern beats the longest prefix. */
function ruleScore(rule: ClientCatalogRule): number {
  if (rule.exact) return 10_000;
  if (rule.pattern) {
    const literals = rule.pattern.split("/").filter((s) => s && !s.startsWith(":")).length;
    return 5_000 + literals * 10;
  }
  return rule.prefix.length;
}

/** Most specific matching rule wins, so a narrow rule can refine a broad one. */
export function clientNamespacesForPath(
  pathname: string | null | undefined
): readonly string[] | null {
  if (!pathname || !pathname.startsWith("/")) return null;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: ClientCatalogRule | null = null;
  for (const rule of CLIENT_CATALOG_RULES) {
    const matches = rule.exact
      ? normalized === rule.prefix
      : rule.pattern
        ? matchesPattern(rule.pattern, normalized)
        : normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`);
    if (!matches) continue;
    if (!best || ruleScore(rule) > ruleScore(best)) best = rule;
  }
  return best?.namespaces ?? null;
}

/**
 * Whether this request should get the narrowed catalog.
 *
 * Staff keep the full catalog: admin and moderator tooling can render on any
 * page, and a missing admin string is a worse outcome than the bytes it saves.
 * Callers that cannot establish the viewer should pass `null` and get `false`,
 * because failing closed here means shipping the catalog exactly as before.
 */
export function shouldTrimClientCatalog(
  pathname: string | null | undefined,
  viewer: { isAdmin?: boolean; isModerator?: boolean } | null | undefined
): boolean {
  if (!clientNamespacesForPath(pathname)) return false;
  return !(viewer?.isAdmin === true || viewer?.isModerator === true);
}

/** Copy only the named namespaces; references are shared, not cloned. */
export function pickClientNamespaces<Messages extends AbstractIntlMessages>(
  messages: Messages,
  namespaces: readonly string[]
): Messages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    if (Object.prototype.hasOwnProperty.call(messages, namespace)) {
      picked[namespace] = messages[namespace];
    }
  }
  return picked as Messages;
}

/** Everything except the root layout's shell namespaces. */
export function nonShellClientMessages<Messages extends AbstractIntlMessages>(
  messages: Messages
): Messages {
  const shell = new Set<string>(SHELL_CLIENT_NAMESPACES);
  return pickClientNamespaces(
    messages,
    Object.keys(messages).filter((namespace) => !shell.has(namespace))
  );
}

/**
 * The namespaces `app/template.tsx` should ship for this request.
 *
 * `null` means "everything the route can reach", i.e. the full catalog minus the
 * shell that the root layout already sent.
 */
export function templateNamespacesForPath(
  pathname: string | null | undefined,
  viewer: { isAdmin?: boolean; isModerator?: boolean } | null | undefined
): readonly string[] | null {
  if (!shouldTrimClientCatalog(pathname, viewer)) return null;
  const namespaces = clientNamespacesForPath(pathname);
  if (!namespaces) return null;
  const shell = new Set<string>(SHELL_CLIENT_NAMESPACES);
  return namespaces.filter((namespace) => !shell.has(namespace));
}
