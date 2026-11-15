/**
 * Pure presentation helpers for the error screens: plain-language copy per
 * catalog code, the report draft a player files, and stack trimming for staff.
 * No db, clock, env or random; callers pass everything in.
 */
import { isErrorCode, type ErrorCode } from "@/lib/errors/catalog";

export interface ErrorCopy {
  title: string;
  explanation: string;
  /** What the player can do next, most useful first. */
  steps: readonly string[];
}

const COPY: Record<ErrorCode, ErrorCopy> = {
  BAD_REQUEST: {
    title: "That request did not go through",
    explanation: "The page sent something the server could not understand.",
    steps: ["Reload the page and try again.", "If it keeps happening, report it."],
  },
  VALIDATION_FAILED: {
    title: "Some values were not accepted",
    explanation: "One or more of the values you submitted did not pass the checks.",
    steps: ["Go back and review what you entered.", "If the values look right, report it."],
  },
  UNAUTHORIZED: {
    title: "You need to sign in",
    explanation: "Your session has ended or you are not signed in.",
    steps: ["Sign in again, then return to this page."],
  },
  DISCORD_LINK_REQUIRED: {
    title: "Link your Discord account first",
    explanation: "New characters need a linked Discord account.",
    steps: ["Link Discord in Settings, then try again."],
  },
  VPN_BLOCKED: {
    title: "VPN connections are blocked",
    explanation: "You appear to be connected through a VPN.",
    steps: ["Turn the VPN off and reload.", "Need VPN access? Ask staff in a Discord ticket."],
  },
  FORBIDDEN: {
    title: "You do not have access to this",
    explanation: "Your account is not allowed to open this page.",
    steps: ["Go back to the dashboard.", "If you think this is wrong, report it."],
  },
  NOT_FOUND: {
    title: "We could not find that",
    explanation: "What you asked for may have been removed or never existed.",
    steps: ["Go back and pick it again from the list."],
  },
  CONFLICT: {
    title: "That changed while you were looking",
    explanation: "The game state moved on, usually because of a turn or another player.",
    steps: ["Try again to load the latest state."],
  },
  OPERATING_RESERVE_SHORT: {
    title: "That would leave too little cash",
    explanation: "Your plants need operating cash that this action would use up.",
    steps: ["Choose a smaller option, or confirm the override."],
  },
  RATE_LIMITED: {
    title: "Slow down for a moment",
    explanation: "You made a lot of requests in a short time.",
    steps: ["Wait about a minute, then try again."],
  },
  INTERNAL_ERROR: {
    title: "The server hit a problem",
    explanation: "This is a fault on our side, not something you did.",
    steps: ["Try again in a moment.", "If it keeps happening, report it."],
  },
  SERVICE_UNAVAILABLE: {
    title: "The game is briefly unavailable",
    explanation: "A service the page depends on is not responding. This often clears quickly.",
    steps: ["Wait a minute and try again.", "Check Discord for any announcement."],
  },
  NETWORK_ERROR: {
    title: "Could not reach the server",
    explanation:
      "Your browser could not complete a request. This is usually temporary and does not mean you were signed out.",
    steps: ["Check your connection and try again."],
  },
  CLIENT_ERROR: {
    title: "This page hit a problem",
    explanation:
      "Something in this page failed while it was loading. Your character and progress are not affected.",
    steps: ["Try again.", "If it keeps happening, report it so we can fix it."],
  },
  SERVER_RENDER_ERROR: {
    title: "The server could not build this page",
    explanation: "The page failed on our side before it reached you. Your progress is safe.",
    steps: ["Try again in a moment.", "If it keeps happening, report it."],
  },
  PAGE_NOT_FOUND: {
    title: "There is no page here",
    explanation: "The address may be mistyped or the page may have moved.",
    steps: ["Head back to the dashboard and navigate from there."],
  },
  CRITICAL_ERROR: {
    title: "The app could not load",
    explanation: "The app hit a problem it could not recover from. Your progress is safe.",
    steps: ["Reload the page.", "If it keeps happening, report it."],
  },
};

export function errorCopyFor(code: string): ErrorCopy {
  return isErrorCode(code) ? COPY[code] : COPY.CLIENT_ERROR;
}

export interface ErrorFacts {
  code: string;
  route: string;
  /** Sentry event id (full). */
  eventId?: string;
  digest?: string;
  build?: string;
  /** ISO timestamp. */
  time: string;
}

/** One line a player can paste anywhere that is enough to find the event. */
export function formatErrorRef(f: ErrorFacts): string {
  const parts = [`code=${f.code}`];
  if (f.eventId) parts.push(`event=${f.eventId}`);
  if (f.digest) parts.push(`digest=${f.digest}`);
  parts.push(`route=${f.route}`, `time=${f.time}`);
  if (f.build) parts.push(`build=${f.build}`);
  return parts.join(" ");
}

export function buildReportDraft(
  f: ErrorFacts,
  pageTitle: string
): { title: string; description: string } {
  return {
    title: `Error on ${f.route}: ${pageTitle}`.slice(0, 120),
    description: [
      "I hit an error screen.",
      "",
      `Page: ${f.route}`,
      `Error code: ${f.code}`,
      f.eventId ? `Event id: ${f.eventId}` : null,
      f.digest ? `Digest: ${f.digest}` : null,
      `Time: ${f.time}`,
      f.build ? `Build: ${f.build}` : null,
      "",
      "What I was doing:",
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),
  };
}

/** First few stack lines (the header line excluded), trimmed for the staff panel. */
export function firstStackFrames(stack: string | undefined, max = 6): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^at\s|@/.test(l))
    .slice(0, max);
}

export function isStaffUser(user: { isAdmin?: boolean; isModerator?: boolean } | null | undefined) {
  return !!(user && (user.isAdmin || user.isModerator));
}
