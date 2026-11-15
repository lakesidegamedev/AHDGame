"use client";

import Link from "next/link";
import { useState } from "react";
import { useReportedError } from "@/lib/errors/useReportedError";
import { errorCopyFor, formatErrorRef } from "@/lib/errors/presentation";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reported = useReportedError(error, {
    logPrefix: "Global error",
    codeOverride: "CRITICAL_ERROR",
  });
  const copy = errorCopyFor(reported.code);
  const [copied, setCopied] = useState(false);
  const refText = formatErrorRef({
    code: reported.code,
    route: reported.route,
    eventId: reported.eventId,
    digest: reported.digest,
    build: reported.build,
    time: reported.time,
  });

  // Outside the app providers: no in-game reporter and no role check, so this
  // screen never shows stack details. It offers a copyable reference instead.
  return (
    <html>
      <body>
        <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-card-border bg-card p-6">
            <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
            <p className="text-sm text-foreground/90">{copy.explanation}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
              {copy.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              To report it, copy the details below and send them to staff in Discord.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={reset}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard
                    .writeText(refText)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
                className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground hover:bg-card-muted transition-colors"
              >
                {copied ? "Copied" : "Copy details"}
              </button>
              <Link href="/" className="px-2 py-2 text-sm text-muted hover:text-foreground">
                Home
              </Link>
            </div>
            <div className="border-t border-card-border pt-3 text-xs text-muted">
              <span className="font-mono" data-testid="error-code">
                {reported.code}
              </span>
              <p className="mt-0.5 break-all font-mono">
                {reported.eventId ?? reported.digest ?? "no reference yet"}
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
