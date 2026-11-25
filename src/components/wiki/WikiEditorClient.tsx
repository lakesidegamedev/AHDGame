"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useWikiEditorState } from "@/hooks/useWikiEditorState";
import { createWikiPageSchema } from "@/lib/api/schemas/wiki";
import { PLAYER_SUBMITTABLE_CATEGORY_IDS, getCategoryById } from "@/lib/wiki/categories";
import { useToast } from "@/contexts/ToastContext";
import { WikiEditorToolbar } from "./WikiEditorToolbar";
import { TemplateSelector } from "./TemplateSelector";
import { MarkdownContent } from "./MarkdownContent";
import { WikiWriterProvider } from "./WikiViewerContext";
import {
  draftDiffersFrom,
  draftKey as makeDraftKey,
  loadDraft,
  saveDraft,
  type EditorDraft,
} from "@/lib/wiki/editorDraft";
import { applyWikilink, findWikilinkQuery, type WikilinkQuery } from "@/lib/wiki/wikilinkQuery";

interface WikiEditorClientProps {
  mode: "create" | "edit";
  isAdmin: boolean;
  initialSlug?: string;
  initialCategory?: string;
  /** Plain-words note shown above the form, such as "your last edit is waiting for review". */
  pendingNotice?: string;
  initialData?: {
    title: string;
    description: string;
    content: string;
    category?: string;
    tags: string[];
    difficulty?: "beginner" | "intermediate" | "advanced";
    featured?: boolean;
    private?: boolean;
  };
}

export function WikiEditorClient({
  mode,
  isAdmin,
  initialSlug,
  initialCategory,
  pendingNotice,
  initialData,
}: WikiEditorClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { state, dispatch } = useWikiEditorState();
  const [tagInput, setTagInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Load initial data for edit mode. Saved content is not an unsaved change.
  useEffect(() => {
    if (mode === "edit" && initialData) {
      dispatch({
        type: "LOAD_INITIAL",
        fields: {
          title: initialData.title,
          description: initialData.description,
          content: initialData.content,
          tags: initialData.tags,
          ...(initialData.category && { category: initialData.category }),
          ...(initialData.difficulty && { difficulty: initialData.difficulty }),
          ...(initialData.featured !== undefined && { featured: initialData.featured }),
          ...(initialData.private !== undefined && { private: initialData.private }),
          slug: initialSlug || "",
        },
      });
    }
  }, [mode, initialData, initialSlug, dispatch]);

  // Prefill category for create mode (e.g. /wiki/new?category=events)
  useEffect(() => {
    if (mode === "create" && initialCategory) {
      dispatch({ type: "SET_FIELD", field: "category", value: initialCategory });
    }
  }, [mode, initialCategory, dispatch]);

  const draftKey = makeDraftKey(mode, initialSlug);

  // Save a draft shortly after typing stops, so a reload or a failed save
  // never costs the writer their text.
  useEffect(() => {
    if (!state.isDirty) return;
    const timeout = setTimeout(() => {
      saveDraft(
        localStorage,
        draftKey,
        {
          title: state.title,
          description: state.description,
          content: state.content,
          tags: state.tags,
          category: state.category,
          difficulty: state.difficulty,
          featured: state.featured,
        },
        Date.now()
      );
    }, 1500);

    return () => clearTimeout(timeout);
  }, [state, draftKey]);

  // Offer back a draft left by an earlier visit, for new pages and edits alike.
  const [restorableDraft, setRestorableDraft] = useState<EditorDraft | null>(null);
  const [draftAgeMinutes, setDraftAgeMinutes] = useState(1);
  useEffect(() => {
    const draft = loadDraft(localStorage, draftKey, Date.now());
    if (!draft) return;
    const saved = mode === "edit" ? initialData : undefined;
    if (saved && !draftDiffersFrom(draft, saved)) {
      localStorage.removeItem(draftKey);
      return;
    }
    setDraftAgeMinutes(Math.max(1, Math.round((Date.now() - draft.timestamp) / 60000)));
    setRestorableDraft(draft);
  }, [draftKey, mode, initialData]);

  const restoreDraft = () => {
    if (!restorableDraft) return;
    const { timestamp: _timestamp, ...fields } = restorableDraft;
    void _timestamp;
    dispatch({
      type: "LOAD_DRAFT",
      draft: { ...fields, difficulty: fields.difficulty ?? null },
    });
    setRestorableDraft(null);
  };

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    setRestorableDraft(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Non-admins must pick a category from the player-submittable list.
    if (!isAdmin && mode === "create" && !state.category) {
      dispatch({
        type: "SET_ERRORS",
        errors: { category: "Please choose a category for this page." },
      });
      return;
    }

    // Validate. Optional zod fields only accept `undefined`, not `null`, so
    // coerce nullable state into `undefined` before parsing — otherwise the
    // schema rejects the payload and the save silently aborts on fields
    // (templateType / difficulty) that have no inline error UI.
    const validated = createWikiPageSchema.safeParse({
      slug: state.slug,
      title: state.title,
      description: state.description,
      content: state.content,
      category: state.category || undefined,
      tags: state.tags,
      templateType: state.selectedTemplate ?? undefined,
      difficulty: state.difficulty ?? undefined,
      featured: state.featured,
      private: state.private,
    });

    if (!validated.success) {
      const fieldErrors = validated.error.flatten().fieldErrors;
      const errors: Record<string, string> = {};
      const summary: string[] = [];
      Object.entries(fieldErrors).forEach(([key, messages]) => {
        const message = messages?.[0] || "Invalid value";
        errors[key] = message;
        summary.push(`${key}: ${message}`);
      });
      // Always surface a top-level error so validation failures on fields
      // without inline error UI (e.g. templateType) can't make Save look dead.
      if (summary.length > 0) {
        errors._form = `Please fix the following before saving: ${summary.join("; ")}`;
      }
      dispatch({ type: "SET_ERRORS", errors });
      const firstError = Object.values(errors)[0];
      if (firstError) showToast(firstError, "error");
      return;
    }

    dispatch({ type: "SUBMIT_START" });

    try {
      // Non-admin edits go through the author PATCH endpoint; non-admin creates
      // through the player submission endpoint; admins use the admin surface.
      const endpoint = isAdmin ? "/api/admin/wiki" : "/api/wiki";
      const method = mode === "create" ? "POST" : "PATCH";
      const url = mode === "edit" ? `${endpoint}/${initialSlug}` : endpoint;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.error ||
            (response.status === 429
              ? "Too many saves. Wait a moment and try again."
              : "The page could not be saved. Your text is still here, so try again.")
        );
      }

      const data = await response.json();
      // Different wiki endpoints surface the slug in different places; fall
      // through each shape so we never redirect to /wiki/undefined on success.
      const nextSlug = data.slug ?? data.page?.slug ?? initialSlug ?? state.slug;
      dispatch({ type: "SUBMIT_SUCCESS" });

      // Only a saved page clears the draft.
      localStorage.removeItem(draftKey);

      showToast(
        isAdmin
          ? mode === "create"
            ? "Page published"
            : "Changes published"
          : mode === "edit"
            ? "Edit sent for review. The current page stays up until it is approved."
            : "Submitted for review",
        "success"
      );
      // Server components on /wiki/[slug] rely on fresh DB reads; without
      // refresh, the redirect can show the cached pre-edit version and make
      // the save look like it didn't take.
      router.refresh();
      router.push(`/wiki/${nextSlug}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message === "Failed to fetch"
            ? "Could not reach the server. Your text is still here, so try again."
            : error.message
          : "The page could not be saved. Your text is still here, so try again.";
      dispatch({ type: "SUBMIT_ERROR", error: message });
      showToast(message, "error");
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !state.tags.includes(tagInput.trim())) {
      dispatch({
        type: "SET_FIELD",
        field: "tags",
        value: [...state.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    dispatch({
      type: "SET_FIELD",
      field: "tags",
      value: state.tags.filter((t) => t !== tag),
    });
  };

  const handleInsert = (before: string, after: string, placeholder?: string) => {
    if (!contentRef.current) return;

    const textarea = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = state.content.substring(start, end);
    const textToInsert = selectedText || placeholder || "";
    const newContent =
      state.content.substring(0, start) +
      before +
      textToInsert +
      after +
      state.content.substring(end);

    dispatch({ type: "SET_FIELD", field: "content", value: newContent });

    // Reset cursor position after React re-renders
    setTimeout(() => {
      if (contentRef.current) {
        const newCursorPos = start + before.length + textToInsert.length;
        contentRef.current.setSelectionRange(newCursorPos, newCursorPos);
        contentRef.current.focus();
      }
    }, 0);
  };

  const handleInsertImage = (snippet: string) => {
    const textarea = contentRef.current;
    if (!textarea) {
      // Fallback: append at end when editor isn't focused yet.
      dispatch({
        type: "SET_FIELD",
        field: "content",
        value: state.content + (state.content.endsWith("\n") ? "" : "\n") + snippet + "\n",
      });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = state.content.substring(0, start) + snippet + state.content.substring(end);
    dispatch({ type: "SET_FIELD", field: "content", value: newContent });
    setTimeout(() => {
      if (contentRef.current) {
        const pos = start + snippet.length;
        contentRef.current.setSelectionRange(pos, pos);
        contentRef.current.focus();
      }
    }, 0);
  };

  const handleTemplateSelect = (templateId: string, sections: string) => {
    if (templateId) {
      dispatch({ type: "SET_TEMPLATE", template: templateId, sections });
    } else {
      dispatch({ type: "SET_FIELD", field: "selectedTemplate", value: null });
    }
  };

  const [link, setLink] = useState<WikilinkQuery | null>(null);
  const [linkResults, setLinkResults] = useState<{ title: string; href: string }[]>([]);
  const [linkIndex, setLinkIndex] = useState(0);

  useEffect(() => {
    if (!link || link.query.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/wiki/search?q=${encodeURIComponent(link.query.trim())}&limit=8`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((json: { results?: { title: string; href: string; kind?: string }[] }) => {
          if (cancelled) return;
          const pages = (json.results ?? []).filter(
            (r) => r.kind === "page" && r.href.startsWith("/wiki/")
          );
          setLinkResults(pages.slice(0, 6).map((r) => ({ title: r.title, href: r.href })));
          setLinkIndex(0);
        })
        .catch(() => !cancelled && setLinkResults([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [link]);

  const pickLink = (choice: { title: string; href: string }) => {
    const textarea = contentRef.current;
    if (!textarea || !link) return;
    const caret = textarea.selectionStart;
    const next = applyWikilink(state.content, caret, link, choice.title, choice.href);
    dispatch({ type: "SET_FIELD", field: "content", value: next.text });
    setLink(null);
    setLinkResults([]);
    setTimeout(() => {
      contentRef.current?.setSelectionRange(next.caret, next.caret);
      contentRef.current?.focus();
    }, 0);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (linkResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLinkIndex((i) => (i + 1) % linkResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setLinkIndex((i) => (i - 1 + linkResults.length) % linkResults.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const choice = linkResults[linkIndex];
      if (choice) pickLink(choice);
    } else if (e.key === "Escape") {
      setLink(null);
      setLinkResults([]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {pendingNotice && (
        <div
          role="status"
          className="rounded-md border border-card-border bg-card/60 p-4 text-body text-foreground"
        >
          {pendingNotice}
        </div>
      )}
      {restorableDraft && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 p-4 text-body text-foreground"
        >
          <span>You have unsaved text from {draftAgeMinutes} minutes ago.</span>
          <span className="flex gap-3">
            <button type="button" onClick={restoreDraft} className="text-primary hover:underline">
              Restore it
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="text-muted hover:text-foreground"
            >
              Discard
            </button>
          </span>
        </div>
      )}
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-body font-medium text-foreground">
          Title
        </label>
        <input
          type="text"
          id="title"
          value={state.title}
          onChange={(e) => dispatch({ type: "SET_FIELD", field: "title", value: e.target.value })}
          className="mt-1 block w-full rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Page title"
        />
        {state.errors.title && <p className="mt-1 text-body text-red-500">{state.errors.title}</p>}
      </div>

      {/* Slug (auto-generated, read-only) */}
      <div>
        <label htmlFor="slug" className="block text-body font-medium text-foreground">
          Slug
        </label>
        <input
          type="text"
          id="slug"
          value={state.slug}
          readOnly
          className="mt-1 block w-full rounded-md border border-card-border bg-muted px-3 py-2 text-muted shadow-sm cursor-not-allowed"
          placeholder="Auto-generated from title"
        />
        {state.errors.slug && <p className="mt-1 text-body text-red-500">{state.errors.slug}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-body font-medium text-foreground">
          Description
        </label>
        <textarea
          id="description"
          value={state.description}
          onChange={(e) =>
            dispatch({ type: "SET_FIELD", field: "description", value: e.target.value })
          }
          rows={2}
          className="mt-1 block w-full rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Brief description of the page"
        />
        {state.errors.description && (
          <p className="mt-1 text-body text-red-500">{state.errors.description}</p>
        )}
      </div>

      {/* Template Selector */}
      {mode === "create" && (
        <TemplateSelector
          selectedTemplate={state.selectedTemplate}
          onSelectTemplate={handleTemplateSelect}
        />
      )}

      {/* Content */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="content" className="block text-body font-medium text-foreground">
            Content
          </label>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-body text-primary hover:text-primary/80"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
        </div>
        <div className="mt-1 space-y-2">
          {!showPreview && (
            <WikiEditorToolbar onInsert={handleInsert} onInsertImage={handleInsertImage} />
          )}
          {showPreview ? (
            <div className="min-h-[500px] rounded-md border border-card-border bg-background px-4 py-6">
              <div className="mx-auto max-w-4xl min-w-0 overflow-x-hidden">
                <article className="prose prose-invert max-w-none overflow-x-hidden">
                  <WikiWriterProvider isWriter>
                    <MarkdownContent content={state.content} />
                  </WikiWriterProvider>
                </article>
              </div>
            </div>
          ) : (
            <div className="relative">
              <textarea
                ref={contentRef}
                id="content"
                value={state.content}
                onKeyDown={handleContentKeyDown}
                onChange={(e) => {
                  dispatch({ type: "SET_FIELD", field: "content", value: e.target.value });
                  setLink(findWikilinkQuery(e.target.value, e.target.selectionStart));
                }}
                rows={20}
                className="block w-full rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-body"
                placeholder="Write your content here in markdown. Type [[ to link another page."
              />
              {linkResults.length > 0 && (
                <ul
                  role="listbox"
                  aria-label="Matching pages"
                  className="absolute left-3 top-10 z-10 w-72 rounded-md border border-card-border bg-card shadow-lg"
                >
                  {linkResults.map((r, i) => (
                    <li key={r.href} role="option" aria-selected={i === linkIndex}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickLink(r);
                        }}
                        className={`block w-full px-3 py-2 text-left text-body text-foreground ${
                          i === linkIndex ? "bg-primary/20" : "hover:bg-muted"
                        }`}
                      >
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {state.errors.content && (
          <p className="mt-1 text-body text-red-500">{state.errors.content}</p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="tags" className="block text-body font-medium text-foreground">
          Tags
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            className="block flex-1 rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Add a tag"
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Add
          </button>
        </div>
        {state.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {state.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 bg-card border border-card-border rounded-full text-body"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-muted hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {state.errors.tags && <p className="mt-1 text-body text-red-500">{state.errors.tags}</p>}
      </div>

      {/* Category — required for non-admin submissions */}
      <div>
        <label htmlFor="category" className="block text-body font-medium text-foreground">
          Category {!isAdmin && <span className="text-red-500">*</span>}
        </label>
        <select
          id="category"
          value={state.category}
          onChange={(e) =>
            dispatch({ type: "SET_FIELD", field: "category", value: e.target.value })
          }
          className="mt-1 block w-full rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select a category…</option>
          {PLAYER_SUBMITTABLE_CATEGORY_IDS.map((id) => {
            const cat = getCategoryById(id);
            return (
              <option key={id} value={id}>
                {cat ? cat.name : id}
              </option>
            );
          })}
        </select>
        {state.errors.category && (
          <p className="mt-1 text-body text-red-500">{state.errors.category}</p>
        )}
        {state.category && (
          <p className="mt-1 text-body-sm text-muted">
            {getCategoryById(state.category)?.description}
          </p>
        )}
      </div>

      {/* Difficulty */}
      <div>
        <label htmlFor="difficulty" className="block text-body font-medium text-foreground">
          Difficulty (optional)
        </label>
        <select
          id="difficulty"
          value={state.difficulty || ""}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "difficulty",
              value: e.target.value || null,
            })
          }
          className="mt-1 block w-full rounded-md border border-card-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">None</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      {/* Admin-only toggles */}
      {isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="featured"
              checked={state.featured}
              onChange={(e) =>
                dispatch({ type: "SET_FIELD", field: "featured", value: e.target.checked })
              }
              className="h-4 w-4 rounded border-card-border text-primary focus:ring-primary"
            />
            <label htmlFor="featured" className="text-body font-medium text-foreground">
              Featured
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="private"
              checked={state.private || false}
              onChange={(e) =>
                dispatch({ type: "SET_FIELD", field: "private", value: e.target.checked })
              }
              className="h-4 w-4 rounded border-card-border text-warning focus:ring-warning"
            />
            <label htmlFor="private" className="text-body font-medium text-foreground">
              Private
              <span className="ml-1 text-body-sm text-muted">(admin-only visibility)</span>
            </label>
          </div>
        </div>
      )}

      {/* Form errors */}
      {state.errors._form && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-body text-red-800">{state.errors._form}</p>
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-card-border rounded-md text-foreground hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={state.isSaving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:bg-card-border disabled:text-muted disabled:hover:bg-card-border disabled:cursor-not-allowed"
        >
          {state.isSaving ? "Saving..." : mode === "create" ? "Create page" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
