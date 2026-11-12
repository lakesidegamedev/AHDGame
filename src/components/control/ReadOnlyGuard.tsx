"use client";

import { useEffect, useState } from "react";

const READ_METHODS = new Set(["GET", "HEAD"]);

function requestInfo(input: RequestInfo | URL, init?: RequestInit): { method: string; url: URL } {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  if (typeof input === "string" || input instanceof URL) {
    return { method: (init?.method ?? "GET").toUpperCase(), url: new URL(input.toString(), base) };
  }
  return { method: (init?.method ?? input.method).toUpperCase(), url: new URL(input.url, base) };
}

/**
 * Courtesy layer for read-only staff. The server already answers 403 to every
 * write; this stops the request leaving the browser and says why, instead of
 * letting each tool show its own unexplained error. It is not the control.
 */
export function ReadOnlyGuard({ active }: { active: boolean }) {
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const original = window.fetch;
    let timer: ReturnType<typeof setTimeout> | undefined;
    window.fetch = async (input, init) => {
      const { method, url } = requestInfo(input, init);
      if (
        !READ_METHODS.has(method) &&
        url.origin === window.location.origin &&
        url.pathname.startsWith("/api/")
      ) {
        setBlocked(`${method} ${url.pathname}`);
        clearTimeout(timer);
        timer = setTimeout(() => setBlocked(null), 6000);
        // eslint-disable-next-line local/no-uncoded-error-response -- synthetic refusal produced in the browser, no server envelope exists
        return Response.json(
          { error: "Your role is read-only. Nothing was changed.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
      return original(input, init);
    };
    return () => {
      window.fetch = original;
      clearTimeout(timer);
    };
  }, [active]);

  if (!active) return null;
  return (
    <div
      role="status"
      className="border-b border-card-border bg-warning/10 px-4 py-2 text-body-sm text-foreground"
    >
      <span className="font-medium">Read-only access.</span>{" "}
      <span className="text-muted">
        You can view everything here, including logs and diagnostics. Changes are refused.
      </span>
      {blocked && (
        <span className="ml-2 font-mono text-body-xs text-warning">Blocked: {blocked}</span>
      )}
    </div>
  );
}
