/** Screens that carry a "?" link to the wiki article explaining them. */
export type WikiHelpScreen =
  | "poll"
  | "impeachment"
  | "primaries"
  | "corporation-tech"
  | "corporation-budget"
  | "bond-market"
  | "stock-market"
  | "bill"
  | "party-leadership"
  | "war-declaration";

export interface WikiHelpTarget {
  slug: string;
  /** Section anchor on the article, without the leading #. */
  anchor?: string;
}

/** The one place that decides which wiki article each in-game screen points at. */
export const WIKI_HELP_TARGETS: Record<WikiHelpScreen, WikiHelpTarget> = {
  poll: { slug: "granular-polling" },
  impeachment: { slug: "impeachment" },
  primaries: { slug: "primaries" },
  "corporation-tech": { slug: "corporate-r-and-d" },
  "corporation-budget": { slug: "corporations" },
  "bond-market": { slug: "sovereign-bonds" },
  "stock-market": { slug: "stock-market" },
  bill: { slug: "bills-legislation" },
  "party-leadership": { slug: "party-leadership" },
  "war-declaration": { slug: "declaring-war" },
};

/** Relative path so the link works on the main site, the wiki host and the sandbox. */
export function wikiHelpHref(screen: WikiHelpScreen): string {
  const { slug, anchor } = WIKI_HELP_TARGETS[screen];
  return `/wiki/${slug}${anchor ? `#${anchor}` : ""}`;
}
