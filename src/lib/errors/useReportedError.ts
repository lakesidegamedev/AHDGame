"use client";

import { useEffect, useState } from "react";
import { ERROR_CATALOG, isErrorCode, type ErrorCode } from "@/lib/errors/catalog";
import { captureClientExceptionWithId } from "@/lib/observability/sentryClientLazy";

const NETWORK_RE = /failed to fetch|networkerror|load failed|fetch.*(failed|aborted)|terminated/i;

/**
 * Pick the catalog code for an error caught by a render boundary. Next.js
 * strips server render errors to a `digest`; client-only failures have none.
 */
export function classifyBoundaryError(
  error: { message?: string; digest?: string } | undefined
): ErrorCode {
  const message = typeof error?.message === "string" ? error.message : "";
  if (NETWORK_RE.test(message)) return "NETWORK_ERROR";
  const explicit = (error as { code?: unknown } | undefined)?.code;
  if (isErrorCode(explicit)) return explicit;
  return error?.digest ? "SERVER_RENDER_ERROR" : "CLIENT_ERROR";
}

export interface ReportedError {
  code: ErrorCode;
  message: string;
  /** Next.js digest when present, else the Sentry event id once captured. */
  ref?: string;
  /** Full Sentry event id once captured. */
  eventId?: string;
  digest?: string;
  route: string;
  /** ISO time the boundary caught the error. */
  time: string;
  build?: string;
}

function currentRoute(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/**
 * Report a boundary error to Sentry once, tagged with its catalog code and
 * route, and return the facts the error screen displays. `codeOverride` lets a
 * boundary that knows its failure mode (e.g. CRITICAL_ERROR in global-error)
 * pin the code. `componentStack` is attached when the boundary has one.
 */
export function useReportedError(
  error: Error & { digest?: string },
  options: { logPrefix?: string; codeOverride?: ErrorCode; componentStack?: string } = {}
): ReportedError {
  const code = options.codeOverride ?? classifyBoundaryError(error);
  const [eventId, setEventId] = useState<string | undefined>();
  const [time] = useState(() => new Date().toISOString());
  const [route] = useState(currentRoute);
  const { logPrefix, componentStack } = options;

  useEffect(() => {
    console.error(`${logPrefix ?? "Page error"}:`, error);
    let cancelled = false;
    void captureClientExceptionWithId(error, {
      tags: {
        error_code: code,
        route,
        ...(error.digest ? { digest: error.digest } : {}),
      },
      extra: { logPrefix, errorName: error.name, errorMessage: error.message },
      contexts: componentStack ? { react: { componentStack } } : undefined,
    }).then((id) => {
      if (!cancelled && id) setEventId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [error, code, logPrefix, route, componentStack]);

  return {
    code,
    message: ERROR_CATALOG[code].message,
    ref: error.digest ?? eventId,
    eventId,
    digest: error.digest,
    route,
    time,
    build: process.env.NEXT_PUBLIC_GIT_COMMIT,
  };
}
