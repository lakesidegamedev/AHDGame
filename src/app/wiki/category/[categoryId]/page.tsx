// src/app/wiki/category/[categoryId]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryBySlug } from "@/lib/wiki/categories";
import { getAllWikiPagesForDisplay } from "@/lib/wiki/getWikiPageData";
import { wikiPublicPageMetadata } from "@/lib/siteMetadata";

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params;
  const category = getCategoryBySlug(categoryId);
  if (!category) return { title: "Category not found", robots: { index: false, follow: false } };
  return wikiPublicPageMetadata({
    title: `${category.name} | Wiki | A House Divided`,
    description: `${category.description}. Browse the official A House Divided wiki pages in this section.`,
    pathname: `/wiki/category/${category.slug}`,
  });
}

const DIFFICULTY_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryId } = await params;
  const category = getCategoryBySlug(categoryId);
  if (!category) notFound();

  const allPages = await getAllWikiPagesForDisplay();
  const categoryPages =
    categoryId === "custom-pages"
      ? allPages.filter((p) => p.isCustomPage)
      : allPages.filter((p) => p.category === categoryId);

  return (
    <div className="mx-auto max-w-[860px] min-w-0 px-4 py-7 sm:px-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted">
        <Link href="/wiki" className="hover:text-foreground transition-colors">
          Wiki
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted mb-3">
          Category
        </p>
        <h1 className="mb-2 text-[34px] font-extrabold leading-[1.15] tracking-[-0.03em] text-foreground">
          {category.name}
        </h1>
        <p className="text-lg text-muted">{category.description}</p>
      </div>

      <div>
        {categoryPages.map((page) => {
          const diff = page.difficulty ? DIFFICULTY_LABELS[page.difficulty] : null;
          return (
            <Link
              key={page.slug}
              href={`/wiki/${page.slug}`}
              className="group block border-b border-card-border/60 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-semibold text-[var(--wiki-link)] group-hover:underline">
                  {page.title}
                </span>
                {diff && <span className="shrink-0 text-[11px] text-muted">{diff}</span>}
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{page.description}</p>
            </Link>
          );
        })}
      </div>

      {categoryPages.length === 0 && (
        <p className="text-center text-muted">No pages in this category yet.</p>
      )}
    </div>
  );
}
