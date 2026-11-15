import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import { escapeRegex } from "@/lib/utils/escapeRegex";
import {
  hasFuzzyEligibleWord,
  rankWikiSearchCandidates,
  type WikiSearchCandidate,
} from "@/lib/wiki/wikiSearch";
import { docsItemsToCandidates, getDocsIndex } from "@/lib/wiki/docsSearch";
import { extractWikiHeadings, type WikiHeading } from "@/lib/wiki/headings";
import { getNonPageWikiSearchCandidates } from "@/lib/wiki/wikiSearchSources";
import type { WikiPage } from "@/lib/db/types";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";

/**
 * Ranking needs more candidates than it returns: the best title match may not
 * be among the first `limit` documents the database happens to hand back.
 */
const CANDIDATE_POOL_MULTIPLIER = 5;
const MAX_CANDIDATE_POOL = 100;
/** Docs hits are appended after wiki hits so they never push a wiki page out. */
const MAX_DOCS_RESULTS = 3;
/** Upper bound on pages scanned by the typo-tolerant fallback. */
const MAX_FUZZY_POOL = 1000;

// GET /api/wiki/search — Searches every wiki surface: published pages plus the
// generated party/seat/office/election pages, category indexes and learning paths.
// Auth: public (private pages excluded for non-admins); blocked when wiki is disabled
// Errors: 403
async function handleGET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    // MongoDB regex patterns cannot contain null bytes.
    if (query.includes("\u0000")) {
      return errorResponse(400, "Query contains an invalid character");
    }
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;
    const tags = searchParams.get("tags")?.split(",").filter(Boolean) || [];
    const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 50);

    const user = await getAuthUser().catch(() => null);
    const isAdmin = user?.isAdmin === true;

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);

    // Build filter — exclude private pages for non-admins
    const filter: Record<string, unknown> = { status: "published" };
    if (!isAdmin) {
      filter.private = { $ne: true };
    }

    if (tags.length > 0) {
      filter.tags = { $in: tags };
    }

    if (query) {
      const escaped = escapeRegex(query);
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
        { content: { $regex: escaped, $options: "i" } },
      ];
    }

    const poolSize = Math.min(limit * CANDIDATE_POOL_MULTIPLIER, MAX_CANDIDATE_POOL);

    // Only pages carry tags, so a tag-filtered search is by definition a search
    // of authored pages — the generated surfaces cannot satisfy it.
    const includeNonPageSurfaces = tags.length === 0;

    const [pageDocs, nonPageCandidates] = await Promise.all([
      wikiPages
        .find(filter)
        .project({ slug: 1, title: 1, description: 1, tags: 1, featured: 1 })
        .limit(poolSize)
        .toArray(),
      includeNonPageSurfaces
        ? // Degrade to authored pages rather than failing the whole search: the
          // generated surfaces aggregate several collections, and a hiccup there
          // should not cost the caller the page results we already have.
          getNonPageWikiSearchCandidates().catch((err) => {
            console.error("[wiki] generated-surface search candidates failed:", err);
            return [] as WikiSearchCandidate[];
          })
        : Promise.resolve([] as WikiSearchCandidate[]),
    ]);

    const toCandidate = (doc: unknown, headings?: WikiHeading[]): WikiSearchCandidate => {
      const page = doc as {
        slug: string;
        title: string;
        description?: string;
        tags?: string[];
        featured?: boolean;
      };
      return {
        slug: page.slug,
        title: page.title,
        description: page.description,
        href: `/wiki/${page.slug}`,
        kind: "page",
        tags: page.tags,
        featured: page.featured,
        // The filter above already matched title, description or content, so a
        // document whose title and description do not match matched its body.
        // Flagging it lets ranking place body hits last without projecting the
        // full article text on every keystroke.
        matchedBody: true,
        headings,
      };
    };

    // Headings need the article text, which is fat. Load it once for the pool so
    // a section match can outrank a body mention and deep-link to its anchor.
    const headingsBySlug = new Map<string, WikiHeading[]>();
    if (query && pageDocs.length > 0) {
      const bodies = await wikiPages
        .find({ ...filter, slug: { $in: pageDocs.map((d) => (d as { slug: string }).slug) } })
        .project({ slug: 1, content: 1 })
        .toArray();
      for (const body of bodies as unknown as Array<{ slug: string; content?: string }>) {
        if (body.content) headingsBySlug.set(body.slug, extractWikiHeadings(body.content));
      }
    }

    const pageCandidates = pageDocs.map((doc) =>
      toCandidate(doc, headingsBySlug.get((doc as { slug: string }).slug))
    );

    let results = rankWikiSearchCandidates(query, [...pageCandidates, ...nonPageCandidates], limit);

    // The database regex cannot see a one-letter typo, so when the exact pass
    // comes up short, scan page titles and descriptions for near matches.
    if (query && results.length < limit && hasFuzzyEligibleWord(query)) {
      const { $or: _or, ...broadFilter } = filter;
      void _or;
      const broad = await wikiPages
        .find(broadFilter)
        .project({ slug: 1, title: 1, description: 1, tags: 1, featured: 1 })
        .limit(MAX_FUZZY_POOL)
        .toArray();
      const seen = new Set(pageCandidates.map((c) => c.slug));
      const extra = broad
        .filter((doc) => !seen.has((doc as unknown as { slug: string }).slug))
        .map((doc) => ({ ...toCandidate(doc), matchedBody: false }));
      results = rankWikiSearchCandidates(
        query,
        [...pageCandidates, ...extra, ...nonPageCandidates],
        limit
      );
    }

    // Docs are best-effort: getDocsIndex never throws and returns [] when the
    // docs site is down, so search keeps working.
    if (query && tags.length === 0) {
      const docsIndex = await getDocsIndex();
      const docsHits = rankWikiSearchCandidates(
        query,
        docsItemsToCandidates(docsIndex, query),
        MAX_DOCS_RESULTS
      );
      results = [...results, ...docsHits];
    }

    return NextResponse.json({ results });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
