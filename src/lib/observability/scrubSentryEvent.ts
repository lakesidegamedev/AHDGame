import type * as Sentry from "@sentry/nextjs";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** Reduce a URL to its path: no origin-specific query string or fragment. */
function pathOnly(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return new URL(raw, "https://placeholder.invalid").pathname;
  } catch {
    return raw.split(/[?#]/)[0];
  }
}

/**
 * Breadcrumb fields that describe what the player did without carrying any
 * payload: request method, path and status, and page-to-page navigation.
 * Everything else in `data` is dropped.
 */
function scrubCrumbData(crumb: Sentry.Breadcrumb): Record<string, unknown> | undefined {
  const data = crumb.data;
  if (!data) return undefined;
  const kept: Record<string, unknown> = {};
  if (crumb.category === "fetch" || crumb.category === "xhr") {
    if (typeof data.method === "string") kept.method = data.method;
    const url = pathOnly(data.url);
    if (url) kept.url = url;
    if (typeof data.status_code === "number") kept.status_code = data.status_code;
  } else if (crumb.category === "navigation") {
    const from = pathOnly(data.from);
    const to = pathOnly(data.to);
    if (from) kept.from = from;
    if (to) kept.to = to;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Keep diagnostic stacks while removing account data from error payloads.
 * The only user field that survives is the opaque account id, so staff can
 * find a player's own errors from a support ticket.
 */
export function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  const userId = typeof event.user?.id === "string" ? event.user.id : undefined;
  delete event.user;
  if (userId) event.user = { id: userId };
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.env;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = value.value.replace(EMAIL, "[email]");
  }
  if (event.message) event.message = event.message.replace(EMAIL, "[email]");
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = crumb.message.replace(EMAIL, "[email]");
    const data = scrubCrumbData(crumb);
    if (data) crumb.data = data;
    else delete crumb.data;
  }
  delete event.extra;
  return event;
}
