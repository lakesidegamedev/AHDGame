"use client";

import { InlineError } from "@/components/ui/InlineError";
import { apiErrorText } from "@/lib/errors/catalog";
import { useState, type FormEvent } from "react";
import { Button, Modal } from "@/components/ui";
import { WIKI_REPORT_REASONS, type WikiReportReason } from "@/lib/db/types/wikiReport";

const REASON_LABELS: Record<WikiReportReason, string> = {
  stale: "Stale (out of date)",
  incorrect: "Incorrect",
  "update-request": "Update request",
  other: "Other",
};

export const WIKI_REPORT_QUOTE_MAX = 500;

interface WikiReportButtonProps {
  slug: string;
  label?: string;
}

/** Text the reader has highlighted on the page, trimmed to the quote limit. */
function readSelectionQuote(): string {
  if (typeof window === "undefined") return "";
  const text = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
  return text.slice(0, WIKI_REPORT_QUOTE_MAX);
}

export function WikiReportButton({ slug, label = "Report page issue" }: WikiReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<WikiReportReason>("stale");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setStatus("idle");
    setError(null);
    setNote("");
    setQuote("");
    setReason("stale");
  }

  function openDialog() {
    // Read before the modal takes focus, which clears the selection.
    setQuote(readSelectionQuote());
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/wiki/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason, note: note.trim(), quote: quote.trim() }),
      });
      if (res.status === 429) {
        setStatus("error");
        setError("Too many reports from this network. Wait a minute and try again.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus("error");
        setError(apiErrorText(body, "Could not send the report."));
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Could not send the report.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-md border border-card-border bg-card/40 px-2.5 py-1 text-muted hover:border-primary/40 hover:text-primary"
      >
        {label}
      </button>
      <Modal open={open} onClose={close} title="Report page issue" maxWidthClass="max-w-sm">
        {status === "done" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Thanks. We logged the report for this page.</p>
            <Button type="button" variant="secondary" size="sm" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted">
              Tell us what is wrong with <span className="font-medium text-foreground">{slug}</span>
              .
            </p>
            <label className="block text-xs font-medium text-foreground">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as WikiReportReason)}
                className="mt-1 w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
              >
                {WIKI_REPORT_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-foreground">
              The wrong text (optional)
              <textarea
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                maxLength={WIKI_REPORT_QUOTE_MAX}
                rows={2}
                className="mt-1 w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
                placeholder="Highlight text on the page before reporting to fill this in"
              />
            </label>
            <label className="block text-xs font-medium text-foreground">
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-1 w-full rounded-md border border-card-border bg-card px-2 py-1.5 text-sm text-foreground"
                placeholder="What should change?"
              />
            </label>
            <InlineError error={error} className="text-sm text-error" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending..." : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
