// Client calls for the Ask drawer. Everything goes through the game's own
// /api/ask-drawer proxy, which signs the player in to Ask server-side.

export interface AskUsage {
  used: number;
  limit: number;
  remaining: number;
  mcpUsed: number;
  mcpLimit: number;
  mcpRemaining: number;
  resetAt: number;
}

export interface AskUpgradeTier {
  key: string;
  label: string;
  name: string;
  price: string;
  questions: number;
  liveQuestions: number;
}

export interface AskUpgradeOffer {
  url: string;
  currentLabel: string;
  tiers: AskUpgradeTier[];
}

export interface AskCitation {
  kind?: string;
  label: string;
  url?: string;
}

export interface AskConversationSummary {
  id: string;
  title?: string;
  snippet?: string;
  pinned?: boolean;
  updated?: number;
  created?: number;
}

export type AskActionKind = "suggestion" | "ticket";

/** A suggestion or ticket Keir drafted. Nothing is filed until the player sends it. */
export interface AskProposedAction {
  id: string;
  kind: AskActionKind;
  title: string;
  description: string;
  category?: string;
  gameSystem?: string;
  expiresAt?: number | string;
}

export interface AskActionReceipt {
  kind: AskActionKind;
  number: number;
  url?: string;
}

export interface AskAnswerPayload {
  convId?: string;
  /** Keir's instant one-line reply, shown before any research. */
  ack?: string;
  /** A drafted action waiting for the player to send or cancel it. */
  proposedAction?: AskProposedAction | null;
  /** Keir offers (never acts) to file something the player raised. */
  offer?: { kind: AskActionKind; label: string } | null;
  answer?: string;
  answerId?: number;
  id?: number;
  citations?: AskCitation[];
  areas?: string[];
  followups?: string[];
  usedMcp?: boolean;
  cached?: boolean;
  usage?: AskUsage;
  error?: string;
  quota?: boolean;
  upgrade?: AskUpgradeOffer | null;
  stopped?: boolean;
  signedOut?: boolean;
  /** A chart was asked for but the daily chart allowance is spent (or the plan lacks it). */
  vizBlocked?: boolean;
  vizLimit?: number | null;
  /** A report request: the answer is also a standalone page. */
  reportUrl?: string | null;
  /** Live game state the answer read, named plainly. */
  liveSources?: Array<{ label: string }>;
  /** Docs that disagree with the code; flagged for review. */
  conflicts?: Array<{ source?: string; page?: string; claim?: string; actual?: string }>;
  /** Offer to re-run a code-only answer against live game state. */
  liveHint?: { label?: string; note?: string } | null;
}

export interface AskMe {
  usage: AskUsage | null;
  entitlement?: { allowed?: boolean; label?: string; staff?: boolean };
  upgrade?: AskUpgradeOffer | null;
  error?: string;
}

const BASE = "/api/ask-drawer";

export async function askJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error || "Ask is unavailable."), { data });
  return data;
}

export type AskStreamEvent =
  | { event: "meta"; data: { convId?: string; status?: string } }
  | { event: "ack"; data: { text?: string } }
  | { event: "status"; data: { label?: string; phase?: string } }
  | { event: "delta"; data: string }
  | { event: "done"; data: AskAnswerPayload }
  | { event: "error"; data: { error?: string } };

/** Split a buffered SSE text into complete events plus the unfinished tail. */
export function parseSse(buffer: string): { events: AskStreamEvent[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: AskStreamEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;
    try {
      events.push({ event, data: JSON.parse(data) } as AskStreamEvent);
    } catch {
      // A malformed block is skipped; the done event carries the full answer.
    }
  }
  return { events, rest };
}

/**
 * Ask a question. Cached answers and refusals come back as JSON; live answers
 * stream. Either way the caller gets events and a final payload.
 */
export async function askQuestion(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onEvent: (event: AskStreamEvent) => void
): Promise<{ ok: boolean; status: number; payload: AskAnswerPayload | null }> {
  const response = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream") || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as AskAnswerPayload;
    return { ok: response.ok, status: response.status, payload };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AskAnswerPayload | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      if (event.event === "done") final = event.data;
      if (event.event === "error") final = { error: event.data.error || "Something went wrong." };
      onEvent(event);
    }
  }
  return { ok: !!final && !final.error, status: response.status, payload: final };
}

export interface AskSuggestedQuestions {
  questions?: string[];
  source?: "page" | "followup" | "default";
}

/** Questions to offer for what is on screen. Free: never counts against the allowance. */
export function suggestQuestions(
  body: { pageContext?: unknown; convId?: string; lastAnswer?: string },
  signal?: AbortSignal
): Promise<AskSuggestedQuestions> {
  return fetch(`${BASE}/suggest-questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  }).then((response) =>
    response.ok ? (response.json() as Promise<AskSuggestedQuestions>) : { questions: [] }
  );
}

/** Up to five usable suggestions, trimmed and de-duplicated. */
export function cleanSuggestions(questions: unknown): string[] {
  if (!Array.isArray(questions)) return [];
  const out: string[] = [];
  for (const q of questions) {
    if (typeof q !== "string") continue;
    const text = q.trim();
    if (text.length < 5 || text.length > 120 || out.includes(text)) continue;
    out.push(text);
    if (out.length === 5) break;
  }
  return out;
}

export type AskActionResult =
  | { ok: true; receipt: AskActionReceipt }
  | { ok: false; error: string; needsDiscordLink?: boolean };

/** Send a drafted action, with the player's edits. A repeat send returns the first receipt. */
export async function confirmAction(body: {
  actionId: string;
  title: string;
  description: string;
}): Promise<AskActionResult> {
  try {
    const response = await fetch(`${BASE}/action/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as {
      receipt?: AskActionReceipt;
      error?: string;
      needsDiscordLink?: boolean;
    };
    if (data.receipt && (response.ok || response.status === 409)) {
      return { ok: true, receipt: data.receipt };
    }
    return {
      ok: false,
      error: data.error || "That did not go through. Try again in a moment.",
      needsDiscordLink: data.needsDiscordLink === true,
    };
  } catch {
    return { ok: false, error: "Ask is not responding. Try again in a moment." };
  }
}
