"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  askJson,
  askQuestion,
  type AskAnswerPayload,
  type AskCitation,
  type AskConversationSummary,
  type AskMe,
  type AskUpgradeOffer,
  type AskUsage,
} from "@/components/askDrawer/askDrawerApi";
import {
  capturePageContext,
  pageLabel,
  type AskPageContext,
} from "@/components/askDrawer/pageContext";
import { AskUsageBars, AskUsageLine } from "@/components/askDrawer/AskUsageBars";
import { AskUpgradeCard } from "@/components/askDrawer/AskUpgradeCard";
import { ASK_SITE_URL } from "@/lib/askDrawer/askService";

// The Ask drawer, laid out like the Ask site: the question as a heading, the
// answer as plain prose with quiet actions beside an "Answer" label, sources
// folded away, and one composer box. Signed in with the player's game account
// and able to read the page they are on.

export type AskDrawerSide = "left" | "right";

const MODES = [
  { id: "auto", label: "Ask", hint: "Choose the best answer path" },
  { id: "verify", label: "Verify", hint: "Test each claim against game evidence" },
  { id: "autopsy", label: "Autopsy", hint: "Trace a live result through rules and recent changes" },
  { id: "scenario", label: "Scenario", hint: "Project a bounded demand or supply shock" },
] as const;
type ModeId = (typeof MODES)[number]["id"];

const STARTERS = [
  "Explain what I'm looking at",
  "What should I do next here?",
  "How are these numbers calculated?",
];

const MAX_QUESTION = 500;
const LIVE_KEY = "ahd-ask-drawer-live";
const SHARE_KEY = "ahd-ask-drawer-share-page";

interface Turn {
  key: string;
  question: string;
  answer: string;
  status: string | null;
  streaming: boolean;
  citations: AskCitation[];
  areas: string[];
  followups: string[];
  answerId: number | null;
  usedMcp: boolean;
  error: string | null;
  upgrade: AskUpgradeOffer | null;
  feedback: "up" | "down" | null;
}

function newTurn(question: string): Turn {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    answer: "",
    status: "Reading the question",
    streaming: true,
    citations: [],
    areas: [],
    followups: [],
    answerId: null,
    usedMcp: false,
    error: null,
    upgrade: null,
    feedback: null,
  };
}

function absoluteAskUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, ASK_SITE_URL);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Preference only lasts this visit.
  }
}

function clientReqId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  close: "M6 18L18 6M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  threads: "M4 6h16M4 12h16M4 18h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  swap: "M7 16l-4-4 4-4M3 12h18M17 8l4 4-4 4",
  send: "M12 19V5M5 12l7-7 7 7",
  stop: "M8 8h8v8H8z",
  up: "M7 11v9H4v-9h3zm0 0l4-8a2 2 0 012 2v4h5a2 2 0 012 2.3l-1.2 7A2 2 0 0116.8 20H7",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  copy: "M9 9h10v10H9zM5 15V5h10",
  pin: "M12 17v5M8 3h8l-1 6 3 3H6l3-3-1-6z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  page: "M7 3h7l5 5v13H7zM14 3v5h5",
  chev: "M9 6l6 6-6 6",
};

const MARKDOWN_CLASS =
  "text-[15px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-card-elevated [&_code]:px-1 [&_code]:text-[13px] [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p:last-child]:mb-0 [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-card-elevated [&_pre]:p-3 [&_table]:mb-3 [&_table]:w-full [&_table]:text-[13px] [&_td]:border-t [&_td]:border-card-border/60 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5";

const QUIET_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

function TurnView({
  turn,
  onFollowup,
  onFeedback,
}: {
  turn: Turn;
  onFollowup: (question: string) => void;
  onFeedback: (turn: Turn, rating: "up" | "down") => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(turn.answer).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <article className="space-y-3">
      <h3 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
        {turn.question}
      </h3>
      <div className="flex items-center gap-2 border-b border-card-border/70 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Answer
        </span>
        {turn.usedMcp && !turn.streaming && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
            <Icon d={ICONS.bolt} className="h-3 w-3" />
            live data
          </span>
        )}
        {!turn.streaming && turn.answer && (
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={copy}
              className={QUIET_BUTTON}
              aria-label={copied ? "Copied" : "Copy answer"}
              title={copied ? "Copied" : "Copy"}
            >
              <Icon d={ICONS.copy} className="h-3.5 w-3.5" />
            </button>
            {turn.answerId && (
              <>
                <button
                  type="button"
                  onClick={() => onFeedback(turn, "up")}
                  disabled={turn.feedback !== null}
                  className={`${QUIET_BUTTON} ${turn.feedback === "up" ? "text-emerald-400" : ""}`}
                  aria-label="Helpful"
                  title="Helpful"
                >
                  <Icon d={ICONS.up} className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback(turn, "down")}
                  disabled={turn.feedback !== null}
                  className={`${QUIET_BUTTON} ${turn.feedback === "down" ? "text-amber-400" : ""}`}
                  aria-label="Report a problem with this answer"
                  title="Report"
                >
                  <Icon d={ICONS.flag} className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {turn.streaming && !turn.answer && (
        <div
          className="flex items-center gap-2 rounded-lg border border-card-border/70 bg-card-elevated/40 px-3 py-2 text-[13px] text-muted"
          role="status"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {turn.status || "Working"}
        </div>
      )}
      {turn.answer && (
        <div className={MARKDOWN_CLASS}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const url = absoluteAskUrl(href);
                return url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ) : (
                  <>{children}</>
                );
              },
            }}
          >
            {turn.answer}
          </ReactMarkdown>
          {turn.streaming && (
            <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse bg-foreground/60 align-middle" />
          )}
        </div>
      )}
      {turn.error && <p className="text-[15px] text-foreground">{turn.error}</p>}
      {turn.upgrade && <AskUpgradeCard offer={turn.upgrade} />}

      {!turn.streaming && turn.citations.length > 0 && (
        <details className="group text-[13px]">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-muted hover:text-foreground">
            <Icon d={ICONS.chev} className="h-3 w-3 transition-transform group-open:rotate-90" />
            Sources used ({turn.citations.length})
            {turn.areas.length > 0 && (
              <span className="truncate text-muted/70"> · {turn.areas.join(", ")}</span>
            )}
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {turn.citations.map((c, i) => {
              const url = absoluteAskUrl(c.url);
              return (
                <li key={i} className="flex items-baseline gap-2">
                  {c.kind && (
                    <span className="w-9 shrink-0 text-[10px] uppercase tracking-wide text-muted">
                      {c.kind}
                    </span>
                  )}
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-foreground hover:underline"
                    >
                      {c.label}
                    </a>
                  ) : (
                    <span className="truncate text-foreground">{c.label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {!turn.streaming && turn.followups.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Ask next
          </div>
          {turn.followups.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFollowup(f)}
              className="flex w-full items-start gap-1.5 rounded-md px-1 py-1 text-left text-[13px] text-muted hover:bg-card-elevated/60 hover:text-foreground"
            >
              <Icon d={ICONS.chev} className="mt-1 h-3 w-3 shrink-0" />
              {f}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function AskDrawerPanel({
  side,
  onClose,
  onSwapSide,
}: {
  side: AskDrawerSide;
  onClose: () => void;
  onSwapSide: () => void;
}) {
  const [view, setView] = useState<"thread" | "history">("thread");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<ModeId>("auto");
  const [live, setLive] = useState(true);
  const [sharePage, setSharePage] = useState(true);
  const [page, setPage] = useState<AskPageContext | null>(null);
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [upgrade, setUpgrade] = useState<AskUpgradeOffer | null>(null);
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [convs, setConvs] = useState<AskConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only preferences and the page */
  useEffect(() => {
    setLive(readFlag(LIVE_KEY, true));
    setSharePage(readFlag(SHARE_KEY, true));
    setPage(capturePageContext());
    inputRef.current?.focus();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadMe = useCallback(() => {
    askJson<AskMe>("me")
      .then((me) => {
        setUnavailable(null);
        if (me.usage) setUsage(me.usage);
        setUpgrade(me.upgrade ?? null);
        setPlanLabel(me.entitlement?.label ?? null);
        if (me.entitlement && me.entitlement.allowed === false) {
          setUnavailable("Ask could not confirm your account. Try again in a moment.");
        }
      })
      .catch((error: Error) => setUnavailable(error.message));
  }, []);

  const loadConvs = useCallback((term: string) => {
    const query = term ? `?q=${encodeURIComponent(term)}` : "";
    askJson<{ conversations?: AskConversationSummary[]; usage?: AskUsage }>(`conversations${query}`)
      .then((d) => {
        setConvs(d.conversations ?? []);
        if (d.usage) setUsage(d.usage);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (view !== "history") return;
    const t = window.setTimeout(() => loadConvs(search.trim()), search ? 220 : 0);
    return () => window.clearTimeout(t);
  }, [view, search, loadConvs]);

  // Re-read the page when the player navigates with the drawer open.
  useEffect(() => {
    let timer = 0;
    const refresh = () => setPage(capturePageContext());
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 600);
    });
    const main = document.getElementById("main-content");
    if (main) observer.observe(main, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const updateTurn = useCallback(
    (key: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
      setTurns((all) =>
        all.map((t) =>
          t.key === key ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t
        )
      );
    },
    []
  );

  const applyFinal = useCallback(
    (key: string, d: AskAnswerPayload) => {
      if (d.convId) setConvId(d.convId);
      if (d.usage) setUsage(d.usage);
      updateTurn(key, (t) => ({
        streaming: false,
        status: null,
        answer: d.answer ?? (d.error ? "" : t.answer),
        citations: d.citations ?? [],
        areas: d.areas ?? [],
        followups: d.followups ?? [],
        answerId: Number(d.answerId || d.id || 0) || null,
        usedMcp: !!d.usedMcp,
        error: d.stopped ? "Stopped. This did not use a question." : (d.error ?? null),
        upgrade: d.quota ? (d.upgrade ?? null) : null,
      }));
    },
    [updateTurn]
  );

  const submit = useCallback(
    async (text?: string) => {
      const q = (text ?? question).trim();
      if (busy || q.length < 5) return;
      const turn = newTurn(q);
      setTurns((all) => [...all, turn]);
      setQuestion("");
      setView("thread");
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = clientReqId();
      reqIdRef.current = reqId;
      const context = sharePage ? capturePageContext() : null;
      if (context) setPage(context);
      try {
        const result = await askQuestion(
          {
            question: q.slice(0, MAX_QUESTION),
            clientReqId: reqId,
            convId: convId ?? undefined,
            mode,
            useMcp: live,
            game: "ahd",
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...(context ? { pageContext: context } : {}),
          },
          controller.signal,
          (event) => {
            if (event.event === "meta" && event.data.convId) setConvId(event.data.convId);
            else if (event.event === "status" && event.data.label)
              updateTurn(turn.key, { status: event.data.label });
            else if (event.event === "delta")
              updateTurn(turn.key, (t) => ({ answer: t.answer + event.data }));
          }
        );
        applyFinal(
          turn.key,
          result.payload ?? { error: "Ask did not finish that answer. It did not use a question." }
        );
      } catch (error) {
        applyFinal(
          turn.key,
          (error as Error).name === "AbortError"
            ? { stopped: true }
            : { error: "Ask is not responding. Try again in a moment." }
        );
      } finally {
        abortRef.current = null;
        reqIdRef.current = null;
        setBusy(false);
      }
    },
    [applyFinal, busy, convId, live, mode, question, sharePage, updateTurn]
  );

  const stop = useCallback(() => {
    const reqId = reqIdRef.current;
    if (reqId) askJson("ask/stop", { reqId }).catch(() => undefined);
    abortRef.current?.abort();
  }, []);

  const newThread = useCallback(() => {
    if (busy) return;
    setTurns([]);
    setConvId(null);
    setView("thread");
    inputRef.current?.focus();
  }, [busy]);

  const openConversation = useCallback(
    (id: string) => {
      if (busy) return;
      setView("thread");
      setConvId(id);
      setTurns([]);
      askJson<{
        turns?: Array<{
          question?: string;
          answer?: string;
          citations?: AskCitation[];
          areas?: string[];
          id?: number;
        }>;
      }>(`conversation?id=${encodeURIComponent(id)}`)
        .then((d) =>
          setTurns(
            (d.turns ?? []).map((t) => ({
              ...newTurn(t.question ?? ""),
              answer: t.answer ?? "",
              streaming: false,
              status: null,
              citations: t.citations ?? [],
              areas: t.areas ?? [],
              answerId: t.id ?? null,
            }))
          )
        )
        .catch(() => setTurns([]));
    },
    [busy]
  );

  const feedback = useCallback(
    (turn: Turn, rating: "up" | "down") => {
      if (!turn.answerId) return;
      updateTurn(turn.key, { feedback: rating });
      askJson("answer/feedback", { answerId: turn.answerId, rating, reason: "" }).catch(() =>
        updateTurn(turn.key, { feedback: null })
      );
    },
    [updateTurn]
  );

  const togglePin = useCallback(
    (c: AskConversationSummary) => {
      askJson("conversation/pin", { id: c.id, pinned: !c.pinned })
        .then(() => loadConvs(search.trim()))
        .catch(() => undefined);
    },
    [loadConvs, search]
  );

  const remove = useCallback(
    (c: AskConversationSummary) => {
      askJson("conversation/delete", { id: c.id })
        .then(() => {
          if (c.id === convId) newThread();
          loadConvs(search.trim());
        })
        .catch(() => undefined);
    },
    [convId, loadConvs, newThread, search]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const outOfQuestions = usage !== null && usage.remaining <= 0;
  const liveAvailable = (usage?.mcpRemaining ?? 1) > 0;
  const fullAskUrl = convId ? `${ASK_SITE_URL}/?c=${encodeURIComponent(convId)}` : ASK_SITE_URL;
  const headerButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-0.5 border-b border-card-border/70 px-3 py-2">
        <div className="mr-auto flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Ask</span>
          <span className="text-[11px] text-muted">Experimental</span>
        </div>
        <button
          type="button"
          onClick={newThread}
          className={headerButton}
          aria-label="New question"
          title="New question"
        >
          <Icon d={ICONS.plus} />
        </button>
        <button
          type="button"
          onClick={() => setView(view === "history" ? "thread" : "history")}
          className={`${headerButton} ${view === "history" ? "bg-card-elevated text-foreground" : ""}`}
          aria-label="Your threads"
          aria-pressed={view === "history"}
          title="Your threads"
        >
          <Icon d={ICONS.threads} />
        </button>
        <a
          href={fullAskUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={headerButton}
          aria-label="Open full Ask"
          title="Open full Ask"
        >
          <Icon d={ICONS.external} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className={headerButton}
          aria-label="Close Ask"
          title="Close"
        >
          <Icon d={ICONS.close} />
        </button>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {unavailable && (
          <div className="mb-4 rounded-lg border border-card-border bg-card-elevated/50 px-3 py-2 text-[13px] text-foreground">
            {unavailable}
          </div>
        )}
        {view === "history" ? (
          <div className="flex min-h-full flex-col">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search threads"
              className="mb-3 w-full rounded-lg border border-card-border bg-background px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <div className="flex-1">
              {convs.length === 0 && (
                <p className="py-8 text-center text-[13px] text-muted">
                  {search ? "No threads match." : "No threads yet. Your questions show up here."}
                </p>
              )}
              {convs.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-0.5 rounded-md pl-2 hover:bg-card-elevated/60 ${c.id === convId ? "bg-card-elevated/60" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className="min-w-0 flex-1 truncate py-1.5 text-left text-[13px] text-foreground"
                    title={c.title || "Untitled"}
                  >
                    {c.title || "Untitled"}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(c)}
                    className={`${QUIET_BUTTON} ${c.pinned ? "text-foreground" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
                    aria-label={c.pinned ? "Unpin thread" : "Pin thread"}
                    aria-pressed={!!c.pinned}
                    title={c.pinned ? "Unpin" : "Pin"}
                  >
                    <Icon d={ICONS.pin} className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className={`${QUIET_BUTTON} opacity-0 focus:opacity-100 group-hover:opacity-100`}
                    aria-label="Delete thread"
                    title="Delete"
                  >
                    <Icon d={ICONS.trash} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 border-t border-card-border/70 pt-3">
              <AskUsageBars usage={usage} planLabel={planLabel} upgrade={upgrade} />
              <button
                type="button"
                onClick={onSwapSide}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground"
              >
                <Icon d={ICONS.swap} className="h-3.5 w-3.5" />
                Move to the {side === "right" ? "left" : "right"} side
              </button>
            </div>
          </div>
        ) : turns.length === 0 ? (
          <div className="pt-6">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Ask about this page
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Answers from the game&apos;s live code, rules and data, with sources.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  disabled={busy || outOfQuestions || !!unavailable}
                  className="rounded-md border border-card-border bg-card-elevated/40 px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            {outOfQuestions && upgrade && <AskUpgradeCard offer={upgrade} />}
          </div>
        ) : (
          <div className="space-y-8">
            {turns.map((t) => (
              <TurnView
                key={t.key}
                turn={t}
                onFollowup={(f) => void submit(f)}
                onFeedback={feedback}
              />
            ))}
          </div>
        )}
      </div>

      <form
        className="px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="rounded-xl border border-card-border bg-background shadow-sm focus-within:border-foreground/30">
          <div className="flex items-end gap-2 px-3 pt-2.5">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              placeholder={turns.length ? "Ask a follow-up" : "Ask about any part of the game"}
              aria-label="Your question"
              className="min-h-[44px] flex-1 resize-none bg-transparent text-[14px] text-foreground placeholder:text-muted focus:outline-none"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
                aria-label="Stop"
                title="Stop"
              >
                <Icon d={ICONS.stop} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={question.trim().length < 5 || !!unavailable}
                className="mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity disabled:bg-card-elevated disabled:text-muted"
                aria-label="Ask"
                title="Ask"
              >
                <Icon d={ICONS.send} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 border-t border-card-border/60 px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setSharePage(!sharePage);
                writeFlag(SHARE_KEY, !sharePage);
              }}
              aria-pressed={sharePage}
              title={
                sharePage
                  ? "Ask reads this page when you ask. Click to stop."
                  : "Ask cannot see this page. Click to share it."
              }
              className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${sharePage ? "text-foreground" : "text-muted"}`}
            >
              <Icon d={ICONS.page} className="h-3 w-3 shrink-0" />
              <span className={`max-w-[9rem] truncate ${sharePage ? "" : "line-through"}`}>
                {page ? pageLabel(page) : "This page"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLive(!live);
                writeFlag(LIVE_KEY, !live);
              }}
              disabled={!liveAvailable}
              aria-pressed={live && liveAvailable}
              title="Read the running game, not just the rules and code"
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] disabled:opacity-50 ${live && liveAvailable ? "text-foreground" : "text-muted"}`}
            >
              <Icon d={ICONS.bolt} className="h-3 w-3" />
              {live && liveAvailable ? "Code + live data" : "Code only"}
            </button>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeId)}
              aria-label="Answer mode"
              title={MODES.find((m) => m.id === mode)?.hint}
              className="ml-auto rounded-md border border-card-border bg-background px-1.5 py-0.5 text-[11px] text-foreground focus:outline-none"
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-1.5 px-1">
          <AskUsageLine usage={usage} open={usageOpen} onToggle={() => setUsageOpen(!usageOpen)} />
          {usageOpen && (
            <div className="mt-2 rounded-lg border border-card-border/70 bg-card-elevated/30 p-2.5">
              <AskUsageBars usage={usage} planLabel={planLabel} upgrade={upgrade} />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
