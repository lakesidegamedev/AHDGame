"use client";

import { useEffect, useMemo, useState } from "react";
import { WikiReviewActions } from "./WikiReviewActions";
import { LocalTime } from "@/components/time/LocalTime";
import { WikiReportsPanel } from "./WikiReportsPanel";
import { WikiReviewLogPanel } from "./WikiReviewLogPanel";
import { MarkdownContent } from "@/components/wiki/MarkdownContent";
import { diffLines, diffStats } from "@/lib/wiki/rules/lineDiff";

interface PendingPage {
  _id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  status: string;
  authorName: string;
  createdAt: string;
  originalContent?: string;
  originalTitle?: string;
  originalDescription?: string;
  isEdit?: boolean;
}

/** Shows the proposed page as readers will see it, so images appear as images, with an optional line diff. */
function ReviewBody({ page }: { page: PendingPage }) {
  const [view, setView] = useState<"page" | "changes">(page.isEdit ? "changes" : "page");
  const diff = useMemo(
    () =>
      page.isEdit && page.originalContent !== undefined
        ? diffLines(page.originalContent, page.content)
        : null,
    [page]
  );

  return (
    <div>
      {diff && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <button
            onClick={() => setView("changes")}
            className={view === "changes" ? "font-semibold text-primary" : "text-muted"}
          >
            Changes ({diffStats(diff).added} added, {diffStats(diff).removed} removed)
          </button>
          <span className="text-muted">/</span>
          <button
            onClick={() => setView("page")}
            className={view === "page" ? "font-semibold text-primary" : "text-muted"}
          >
            Proposed page
          </button>
        </div>
      )}
      {diff && view === "changes" ? (
        <div className="bg-background border border-card-border rounded p-3 max-h-[32rem] overflow-y-auto font-mono text-xs whitespace-pre-wrap">
          {diff.map((line, i) =>
            line.op === "same" ? (
              <div key={i} className="text-muted">
                {"  "}
                {line.text}
              </div>
            ) : (
              <div key={i}>
                <div
                  className={
                    line.op === "add"
                      ? "bg-green-500/15 text-green-300"
                      : "bg-red-500/15 text-red-300"
                  }
                >
                  {line.op === "add" ? "+ " : "- "}
                  {line.text}
                </div>
                {/* An added or removed image line is shown as the picture itself. */}
                <DiffImage text={line.text} removed={line.op === "remove"} />
              </div>
            )
          )}
        </div>
      ) : (
        <div className="bg-background border border-card-border rounded p-4 max-h-[32rem] overflow-y-auto">
          <article className="prose prose-invert max-w-none">
            <MarkdownContent content={page.content} />
          </article>
        </div>
      )}
    </div>
  );
}

const IMAGE_LINE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function DiffImage({ text, removed }: { text: string; removed: boolean }) {
  const images = Array.from(text.matchAll(IMAGE_LINE)).filter(
    (m) => m[2]?.startsWith("/") || /^https?:\/\//.test(m[2] ?? "")
  );
  if (images.length === 0) return null;
  return (
    <div className="my-1 flex flex-wrap gap-2">
      {images.map((m, i) => (
        <img
          key={i}
          src={m[2]}
          alt={m[1] ?? ""}
          loading="lazy"
          className={`max-h-40 rounded border ${removed ? "border-red-500/50 opacity-60" : "border-green-500/50"}`}
        />
      ))}
    </div>
  );
}

function PendingSubmissions() {
  const [pending, setPending] = useState<PendingPage[]>([]);
  const [selected, setSelected] = useState<PendingPage | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPending = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/wiki/review-queue");
      if (response.ok) {
        const data = await response.json();
        // API returns { pending: WikiPage[] }; normalize into the component's
        // PendingPage shape.
        const pages: PendingPage[] = (data.pending ?? []).map((p: Record<string, unknown>) => ({
          _id: String(p._id),
          slug: String(p.slug),
          title: String(p.title),
          description: String(p.description ?? ""),
          content: String(p.content ?? ""),
          tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
          difficulty: p.difficulty as PendingPage["difficulty"],
          status: String(p.status ?? "pending_review"),
          authorName:
            (p.submitterName as string | undefined) ??
            (p.authorName as string | undefined) ??
            "Unknown",
          createdAt: String(p.createdAt ?? ""),
          isEdit: p.isEdit === true,
          originalContent: p.originalContent === undefined ? undefined : String(p.originalContent),
          originalTitle: p.originalTitle === undefined ? undefined : String(p.originalTitle),
          originalDescription:
            p.originalDescription === undefined ? undefined : String(p.originalDescription),
        }));
        setPending(pages);
      }
    } catch (error) {
      console.error("Failed to load pending pages:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  if (loading) {
    return <div className="text-muted">Loading pending submissions...</div>;
  }

  if (pending.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">No pending wiki submissions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          Pending wiki submissions ({pending.length})
        </h2>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelected(null)}
              className="text-sm text-primary hover:text-primary/80"
            >
              ← Back to list
            </button>
            <WikiReviewActions
              slug={selected.slug}
              onApprove={() => {
                loadPending();
                setSelected(null);
              }}
              onReject={() => {
                loadPending();
                setSelected(null);
              }}
            />
          </div>

          <div className="bg-card border border-card-border rounded-lg p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">{selected.title}</h3>
            <p className="text-sm text-muted mb-4">
              By {selected.authorName} •{" "}
              <LocalTime value={selected.createdAt} options={{ dateStyle: "medium" }} />
            </p>

            <ReviewBody page={selected} />

            <div className="mt-4 space-y-2">
              <p className="text-sm">
                <span className="font-medium">Description:</span> {selected.description}
              </p>
              <p className="text-sm">
                <span className="font-medium">Tags:</span> {selected.tags.join(", ") || "None"}
              </p>
              {selected.difficulty && (
                <p className="text-sm">
                  <span className="font-medium">Difficulty:</span> {selected.difficulty}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-card-border">
          {pending.map((page) => (
            <div
              key={page._id}
              className="p-4 hover:bg-muted cursor-pointer"
              onClick={() => setSelected(page)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{page.title}</h3>
                  <p className="text-sm text-muted mt-1">{page.description}</p>
                  <p className="text-xs text-muted mt-2">
                    By {page.authorName} •{" "}
                    <LocalTime value={page.createdAt} options={{ dateStyle: "medium" }} />
                  </p>
                </div>
                <span className="px-3 py-1 text-xs font-medium bg-warning/20 border border-warning/30 text-warning rounded-full">
                  {page.isEdit ? "edit to live page" : "new page"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WikiReviewTab() {
  return (
    <div className="space-y-10">
      <PendingSubmissions />
      <WikiReviewLogPanel />
      <WikiReportsPanel />
    </div>
  );
}
