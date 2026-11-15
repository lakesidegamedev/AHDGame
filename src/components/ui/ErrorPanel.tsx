"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useOptionalAuthMe } from "@/contexts/AuthDataContext";
import type { ReportedError } from "@/lib/errors/useReportedError";
import {
  buildReportDraft,
  errorCopyFor,
  firstStackFrames,
  formatErrorRef,
  isStaffUser,
} from "@/lib/errors/presentation";

// The reporter only loads when a player opens it.
const FeedbackModal = dynamic(
  () => import("@/components/FeedbackModal").then((module) => module.FeedbackModal),
  { ssr: false }
);

export interface ErrorPanelLink {
  href: string;
  label: string;
}

export interface ErrorPanelProps {
  error: Error & { digest?: string };
  reported: ReportedError;
  onRetry: () => void;
  /** Overrides the plain-language title for the error code. */
  title?: string;
  /** Page-specific lead sentence shown before the generic explanation. */
  description?: string;
  links?: ErrorPanelLink[];
  fullScreen?: boolean;
  /** False where the in-game reporter cannot mount (outside app providers). */
  allowReport?: boolean;
}

const BUTTON_BASE =
  "rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => {});
        setTimeout(() => setDone(false), 2000);
      }}
      className="rounded-md border border-card-border px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function StaffDetails({
  error,
  reported,
}: {
  error: Error & { digest?: string };
  reported: ReportedError;
}) {
  const frames = firstStackFrames(error.stack);
  const rows: [string, string | undefined][] = [
    ["Error", error.name],
    ["Message", error.message],
    ["Code", reported.code],
    ["Route", reported.route],
    ["Digest", reported.digest],
    ["Build", reported.build],
    ["Sentry event", reported.eventId],
  ];
  return (
    <details className="rounded-lg border border-card-border bg-card-muted/40 text-left text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-muted hover:text-foreground">
        Staff details
      </summary>
      <dl className="space-y-1 border-t border-card-border px-3 py-2" data-testid="staff-details">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all font-mono text-foreground">{v || "none"}</dd>
          </div>
        ))}
        {frames.length > 0 && (
          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <dt className="text-muted">Stack</dt>
            <dd className="space-y-0.5 break-all font-mono text-foreground">
              {frames.map((f, i) => (
                <div key={i}>{f}</div>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

/** Shared error screen used by every route error boundary. */
export function ErrorPanel({
  error,
  reported,
  onRetry,
  title,
  description,
  links = [{ href: "/dashboard", label: "Dashboard" }],
  fullScreen = false,
  allowReport = true,
}: ErrorPanelProps) {
  const auth = useOptionalAuthMe();
  const staff = isStaffUser(auth?.user);
  const [reporting, setReporting] = useState(false);
  const copy = errorCopyFor(reported.code);
  const heading = title ?? copy.title;
  const lead = description ?? copy.explanation;
  const showExplanation = description !== undefined && description !== copy.explanation;
  const navLinks = links.some((l) => l.href === "/")
    ? links
    : [...links, { href: "/", label: "Home" }];
  const facts = {
    code: reported.code,
    route: reported.route,
    eventId: reported.eventId,
    digest: reported.digest,
    build: reported.build,
    time: reported.time,
  };
  const refText = formatErrorRef(facts);
  const heightClass = fullScreen ? "min-h-screen" : "min-h-[50vh]";

  return (
    <div
      className={`${heightClass} bg-background flex flex-col items-center justify-center px-6 py-12`}
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-card-border bg-card p-6">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
          <p className="text-sm text-foreground/90">{lead}</p>
          {showExplanation && <p className="text-sm text-muted">{copy.explanation}</p>}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">What you can do</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className={`${BUTTON_BASE} bg-primary text-white hover:bg-primary/90`}
          >
            Try again
          </button>
          {allowReport && (
            <button
              type="button"
              onClick={() => setReporting(true)}
              className={`${BUTTON_BASE} border border-card-border text-foreground hover:bg-card-muted`}
            >
              Report this problem
            </button>
          )}
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-2 py-2 text-sm text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-card-border pt-3">
          <div className="min-w-0 text-xs text-muted">
            <span className="font-mono" data-testid="error-code">
              {reported.code}
            </span>
            <p className="mt-0.5 break-all font-mono" data-testid="error-ref">
              {reported.eventId ?? reported.digest ?? "no reference yet"}
            </p>
          </div>
          <CopyButton text={refText} label="Copy details" />
        </div>

        {staff && <StaffDetails error={error} reported={reported} />}
      </div>

      {reporting && (
        <FeedbackModal
          isOpen
          onClose={() => setReporting(false)}
          initialType="bug"
          prefill={{ ...buildReportDraft(facts, heading), category: "other" }}
        />
      )}
    </div>
  );
}
