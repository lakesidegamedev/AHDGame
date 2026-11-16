export interface SectionTreePage {
  title: string;
  href: string;
}

export interface SectionTreeGroup {
  id: string;
  name: string;
  /** Category overview page, shown first inside the group. */
  overviewHref: string;
  pages: SectionTreePage[];
}

interface CategoryInput {
  id: string;
  name: string;
}

interface PageInput {
  slug: string;
  title: string;
  category?: string;
}

/** Categories in their fixed order; pages sorted by title; empty categories dropped. */
export function buildSectionTree(
  categories: readonly CategoryInput[],
  pages: readonly PageInput[]
): SectionTreeGroup[] {
  const byCategory = new Map<string, SectionTreePage[]>();
  for (const page of pages) {
    const key = page.category ?? "reference";
    const list = byCategory.get(key) ?? [];
    list.push({ title: page.title, href: `/wiki/${page.slug}` });
    byCategory.set(key, list);
  }
  return categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      overviewHref: `/wiki/category/${c.id}`,
      pages: (byCategory.get(c.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.pages.length > 0);
}

/** The group a pathname belongs to, so it can start expanded. */
export function groupIdForPath(
  groups: readonly SectionTreeGroup[],
  pathname: string
): string | null {
  for (const g of groups) {
    if (pathname === g.overviewHref || g.pages.some((p) => p.href === pathname)) return g.id;
  }
  return null;
}
