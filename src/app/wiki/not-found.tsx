"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { slugToSearchQuery } from "@/lib/wiki/links";

interface Suggestion {
  slug: string;
  title: string;
  href?: string;
  description?: string;
  kind?: string;
}

const SUGGESTION_COUNT = 5;

export default function WikiNotFound() {
  const pathname = usePathname() ?? "";
  const query = slugToSearchQuery(pathname);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/wiki/search?q=${encodeURIComponent(query)}&limit=${SUGGESTION_COUNT}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { results?: Suggestion[] } | null) => {
        const wikiOnly = (body?.results ?? []).filter((r) => r.kind !== "docs");
        setSuggestions(wikiOnly.slice(0, SUGGESTION_COUNT));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [query]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-heading font-bold text-foreground">That wiki page does not exist</h1>
      <p className="mt-2 text-body text-muted">
        It may have been renamed or removed.{" "}
        {suggestions.length > 0 ? "These pages might be what you wanted:" : null}
      </p>
      {suggestions.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Suggested pages">
          {suggestions.map((s) => (
            <li key={s.href ?? s.slug}>
              <Link
                href={s.href ?? `/wiki/${s.slug}`}
                className="block rounded-lg border border-card-border bg-card/40 px-4 py-3 hover:border-primary/40"
              >
                <span className="font-medium text-foreground">{s.title}</span>
                {s.description && (
                  <span className="mt-0.5 line-clamp-1 block text-body-sm text-muted">
                    {s.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-body">
        <Link href="/wiki" className="text-primary hover:underline">
          Back to the wiki home
        </Link>
      </p>
    </div>
  );
}
