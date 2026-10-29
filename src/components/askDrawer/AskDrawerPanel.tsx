"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  askEnergy,
  askJson,
  askQuestion,
  chargeLine,
  cleanSuggestions,
  energySpent,
  suggestQuestions,
  type AskActionReceipt,
  type AskAnswerPayload,
  type AskCitation,
  type AskConversationSummary,
  type AskMe,
  type AskUpgradeOffer,
  type AskProposedAction,
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
import { isValidElement, type ReactNode } from "react";
import { AskChart, AskDiagram, AskMap, richKind } from "@/components/askDrawer/AskRichBlock";
import {
  KEIR_STATES,
  KeirAvatar,
  KeirSprite,
  type KeirMood,
} from "@/components/askDrawer/KeirSprite";
import { AskActionCard } from "@/components/askDrawer/AskActionCard";
import {
  ALERT_MS,
  IDLE_SLEEP_MS,
  LONG_WAIT_MS,
  finishMood,
  keirMood as pickKeirMood,
  moodForStatus,
  type KeirRest,
} from "@/components/askDrawer/keirMood";

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
const SHARE_KEY = "ahd-ask-drawer-share-page";

interface Turn {
  key: string;
  question: string;
  /** Keir's instant reply ("I'll look into ... for you."), shown before research. */
  ack: string | null;
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
  /** The research steps Ask narrated while it worked, and how long it took. */
  trail: string[];
  elapsedMs: number | null;
  proposedAction: AskProposedAction | null;
  offer: AskAnswerPayload["offer"];
  /** "Used 3% of today's energy (live data, chart)" once the answer is settled. */
  chargeNote: string | null;
  extras: Pick<AskAnswerPayload, "vizBlocked" | "reportUrl" | "liveSources" | "conflicts">;
}

function newTurn(question: string): Turn {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question,
    ack: null,
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
    trail: [],
    elapsedMs: null,
    proposedAction: null,
    offer: null,
    chargeNote: null,
    extras: {},
  };
}

/** A fenced block Ask draws (chart, map, diagram) rather than prints. */
function RichBlock({
  lang,
  code,
  streaming,
  question,
  fullAskUrl,
}: {
  lang: string;
  code: string;
  streaming: boolean;
  question: string;
  fullAskUrl: string;
}) {
  const kind = richKind(lang, code);
  if (streaming && kind !== "diagram") {
    return (
      <div
        className="my-3 flex h-24 items-center justify-center rounded-xl border border-card-border/70 bg-card-elevated/40 text-[12px] text-muted"
        role="status"
      >
        <span className="animate-pulse">{kind === "map" ? "Drawing map…" : "Drawing chart…"}</span>
      </div>
    );
  }
  if (kind === "chart") {
    return (
      <AskChart
        source={code}
        format={lang === "ask-chart" ? "ask-chart" : "mermaid"}
        question={question}
        fullAskUrl={fullAskUrl}
      />
    );
  }
  if (kind === "map") return <AskMap source={code} fullAskUrl={fullAskUrl} />;
  return <AskDiagram fullAskUrl={fullAskUrl} />;
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

/** Keir, with a small "!" bubble while the first words of an answer arrive. */
function KeirWithAlert({
  mood,
  alerting,
  scale,
  avatar = false,
  size = 38,
}: {
  mood: KeirMood;
  alerting: boolean;
  scale?: number;
  size?: number;
  /** A round head-and-shoulders crop, for the header. */
  avatar?: boolean;
}) {
  return (
    <span className="relative inline-flex">
      {avatar ? <KeirAvatar mood={mood} size={size} /> : <KeirSprite mood={mood} scale={scale} />}
      {alerting && (
        <span
          aria-hidden
          data-keir-alert
          className="absolute -right-2 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold leading-none text-black shadow"
        >
          !
        </span>
      )}
    </span>
  );
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
  share: "M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  check: "M5 12l5 5 9-10",
};

const REPORT_REASONS = [
  "Wrong or outdated",
  "Didn't answer the question",
  "Missing sources",
  "Confusing",
  "Other",
];

/** Thread list sections, the same ones the Ask site uses. */
export function threadGroup(ts: number | undefined, now = new Date()): string {
  if (!ts) return "Older";
  const d = new Date(ts);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString()) return "Yesterday";
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  return days < 7 ? "Previous 7 days" : "Older";
}

export function groupThreads(
  convs: AskConversationSummary[],
  searching: boolean,
  now = new Date()
): Array<{ label: string; items: AskConversationSummary[] }> {
  const groups: Array<{ label: string; items: AskConversationSummary[] }> = [];
  for (const c of convs) {
    const label = searching
      ? "Matches"
      : c.pinned
        ? "Pinned"
        : threadGroup(c.updated ?? c.created, now);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(c);
    else groups.push({ label, items: [c] });
  }
  return groups;
}

const MARKDOWN_CLASS =
  "text-[15px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-card-elevated [&_code]:px-1 [&_code]:text-[13px] [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p:last-child]:mb-0 [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-card-elevated [&_pre]:p-3 [&_table]:mb-3 [&_table]:w-full [&_table]:text-[13px] [&_td]:border-t [&_td]:border-card-border/60 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5";

/** Hover-revealed on desktop; always shown on touch screens, which cannot hover. */
const TOUCH_VISIBLE =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100";

/** The typing caret, drawn at the end of the last paragraph or list item rather than on a line of its own. */
const STREAM_CARET =
  "[&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:ml-0.5 [&>p:last-child]:after:ml-0.5 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:inline-block [&>p:last-child]:after:inline-block [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:h-4 [&>p:last-child]:after:h-4 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:w-[3px] [&>p:last-child]:after:w-[3px] [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:animate-pulse [&>p:last-child]:after:animate-pulse [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:bg-foreground/60 [&>p:last-child]:after:bg-foreground/60 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:align-middle [&>p:last-child]:after:align-middle [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:content-[''] [&>p:last-child]:after:content-['']";

const QUIET_BUTTON =
  "inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

/** Report an answer: a reason chip plus optional detail, as on the Ask site. */
function ReportForm({
  onSend,
  onCancel,
}: {
  onSend: (reason: string) => void;
  onCancel: () => void;
}) {
  const [tag, setTag] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  return (
    <div
      className="space-y-2 rounded-lg border border-card-border bg-card-elevated/40 p-3"
      data-ask-report
    >
      <p className="text-[13px] text-foreground">
        What went wrong? Staff review every report, with this question and answer.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={tag === r}
            onClick={() => setTag(tag === r ? null : r)}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${tag === r ? "border-transparent bg-primary text-white" : "border-card-border text-muted hover:text-foreground"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="Add detail (optional)"
        aria-label="Report detail"
        className="w-full resize-none rounded-md border border-card-border bg-background px-2 py-1.5 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none sm:text-[13px]"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!tag && !detail.trim()}
          onClick={() => onSend([tag ?? "", detail.trim()].filter(Boolean).join(": "))}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:bg-card-elevated disabled:text-muted"
        >
          Send report
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1.5 text-[12px] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function TurnView({
  turn,
  fullAskUrl,
  canShare,
  onFollowup,
  onFeedback,
  onShare,
  onFiled,
  keir,
}: {
  turn: Turn;
  fullAskUrl: string;
  canShare: boolean;
  onFollowup: (question: string) => void;
  onFeedback: (turn: Turn, rating: "up" | "down", reason?: string) => void;
  onShare: () => Promise<string | null>;
  onFiled: (receipt: AskActionReceipt) => void;
  /** Keir, shown beside the research steps while this answer is being worked on. */
  keir?: ReactNode;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const noteTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(noteTimer.current), []);
  const flashNote = (text: string) => {
    setNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 1800);
  };
  const copy = () => {
    void navigator.clipboard
      ?.writeText(turn.answer)
      .then(() => flashNote("Copied"))
      .catch(() => flashNote("Could not copy"));
  };
  const share = () => {
    void onShare().then((message) => message && flashNote(message));
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
            {note && (
              <span className="mr-1 text-[11px] text-emerald-400" role="status">
                {note}
              </span>
            )}
            <button
              type="button"
              onClick={copy}
              className={QUIET_BUTTON}
              aria-label="Copy answer"
              title="Copy"
            >
              <Icon d={ICONS.copy} className="h-3.5 w-3.5" />
            </button>
            {canShare && (
              <button
                type="button"
                onClick={share}
                className={QUIET_BUTTON}
                aria-label="Share this thread"
                title="Share"
              >
                <Icon d={ICONS.share} className="h-3.5 w-3.5" />
              </button>
            )}
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
                  onClick={() => setReporting(true)}
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

      {reporting && turn.feedback === null && (
        <ReportForm
          onCancel={() => setReporting(false)}
          onSend={(reason) => {
            setReporting(false);
            onFeedback(turn, "down", reason);
            flashNote("Reported. Thank you.");
          }}
        />
      )}
      {turn.ack && <p className="text-[15px] leading-relaxed text-foreground">{turn.ack}</p>}
      {turn.streaming && !turn.answer && (
        <div className="flex items-start gap-3">
          {keir}
          <div
            className="min-w-0 flex-1 space-y-1 rounded-lg border border-card-border/70 bg-card-elevated/40 px-3 py-2 text-[13px] text-muted"
            role="status"
            aria-live="polite"
          >
            {/* The research steps as they happen; the latest one is still running. */}
            {turn.trail.slice(-5, -1).map((step, i) => (
              <div key={`${i}-${step}`} className="flex items-center gap-2 text-muted/80">
                <span className="text-[11px] text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span className="truncate">{step}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
              <span className="truncate">{turn.status || turn.trail.at(-1) || "Working"}</span>
            </div>
          </div>
        </div>
      )}
      {turn.answer && (
        <div className={`${MARKDOWN_CLASS} ${turn.streaming ? STREAM_CARET : ""}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ className, children }) => {
                const lang = /language-([\w.+#-]+)/.exec(className || "")?.[1]?.toLowerCase();
                const code = String(children ?? "").replace(/\n$/, "");
                if (lang && richKind(lang, code)) {
                  return (
                    <RichBlock
                      lang={lang}
                      code={code}
                      streaming={turn.streaming}
                      question={turn.question}
                      fullAskUrl={fullAskUrl}
                    />
                  );
                }
                return <code className={className}>{children}</code>;
              },
              // A drawn block replaces its <pre> wrapper entirely.
              pre: ({ children }) => {
                const only = Array.isArray(children) ? null : (children as ReactNode);
                if (isValidElement(only) && only.type === RichBlock) return <>{only}</>;
                return <pre>{children}</pre>;
              },
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
        </div>
      )}
      {turn.error && <p className="text-[15px] text-foreground">{turn.error}</p>}
      {turn.upgrade && <AskUpgradeCard offer={turn.upgrade} />}
      {!turn.streaming && turn.proposedAction && (
        <AskActionCard action={turn.proposedAction} onFiled={onFiled} />
      )}
      {!turn.streaming &&
        !turn.proposedAction &&
        turn.offer?.label &&
        !turn.followups.includes(turn.offer.label) && (
          <button
            type="button"
            onClick={() => onFollowup(turn.offer?.label ?? "")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-card-border px-2.5 text-[12px] text-foreground hover:border-foreground/30 sm:min-h-0 sm:py-1"
          >
            <Icon d={ICONS.flag} className="h-3.5 w-3.5" />
            {turn.offer.label}
          </button>
        )}

      {!turn.streaming && turn.chargeNote && (
        <p className="text-[11px] text-muted">{turn.chargeNote}</p>
      )}
      {!turn.streaming && turn.extras.vizBlocked && (
        <p className="text-[13px] text-muted">This one is answered in prose.</p>
      )}
      {!turn.streaming && turn.extras.reportUrl && absoluteAskUrl(turn.extras.reportUrl) && (
        <a
          href={absoluteAskUrl(turn.extras.reportUrl) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13px] text-primary underline"
        >
          Open this report as its own shareable page
        </a>
      )}
      {!turn.streaming &&
        (turn.extras.conflicts ?? []).map((c, i) => (
          <div
            key={i}
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[13px] text-foreground"
          >
            <b className="font-semibold">Documentation may be out of date.</b> The {c.source}
            {c.page ? ` page "${c.page}"` : ""} says {c.claim}, but the game code does: {c.actual}.
            This has been flagged for review.
          </div>
        ))}
      {!turn.streaming && (turn.trail.length > 0 || (turn.extras.liveSources ?? []).length > 0) && (
        <details className="group text-[13px]">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-muted hover:text-foreground">
            <Icon d={ICONS.chev} className="h-3 w-3 transition-transform group-open:rotate-90" />
            {turn.trail.length > 0
              ? `Researched ${turn.trail.length} step${turn.trail.length === 1 ? "" : "s"}${turn.elapsedMs ? ` in ${(turn.elapsedMs / 1000).toFixed(1)}s` : ""}`
              : "Research"}
            {(turn.extras.liveSources ?? []).length > 0 && (
              <span className="text-muted/70">
                {" "}
                · {(turn.extras.liveSources ?? []).length} live read
                {(turn.extras.liveSources ?? []).length === 1 ? "" : "s"}
              </span>
            )}
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-muted">
            {turn.trail.map((step, i) => (
              <li key={`s${i}`}>{step}</li>
            ))}
            {(turn.extras.liveSources ?? []).map((s, i) => (
              <li key={`l${i}`} className="flex items-center gap-1 text-foreground">
                <Icon d={ICONS.bolt} className="h-3 w-3" />
                {s.label}
              </li>
            ))}
          </ul>
        </details>
      )}

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
  const [sharePage, setSharePage] = useState(true);
  const [page, setPage] = useState<AskPageContext | null>(null);
  const [usage, setUsage] = useState<AskUsage | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [upgrade, setUpgrade] = useState<AskUpgradeOffer | null>(null);
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [convs, setConvs] = useState<AskConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A one-off reaction (wave on open, nod on the ack, thumbs up when an answer lands).
  const [flash, setFlash] = useState<KeirMood | null>("wave");
  const [typing, setTyping] = useState(false);
  // What Keir does while research runs: the step's state, then a rotation if it goes quiet.
  const [stepMood, setStepMood] = useState<KeirMood>("thinking");
  const [quietPeriods, setQuietPeriods] = useState(0);
  // The "!" when the first words of an answer arrive, before Keir starts talking.
  const [alerting, setAlerting] = useState(false);
  const [rest, setRest] = useState<KeirRest>(null);
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const alertedRef = useRef<string | null>(null);
  const alertTimerRef = useRef(0);
  const restTimerRef = useRef(0);
  const lastActivityRef = useRef(0);
  const swipeRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only preferences and the page */
  useEffect(() => {
    setSharePage(readFlag(SHARE_KEY, true));
    setPage(capturePageContext());
    inputRef.current?.focus();
    lastActivityRef.current = Date.now();
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

  // Follow the answer as it streams only while the player is at the bottom.
  // Snapping down on every word fought anyone scrolling up to read, and on
  // phones the jumps shook the whole sheet.
  const stickRef = useRef(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
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
        error: d.stopped ? "Stopped. This did not use any energy." : (d.error ?? null),
        upgrade: d.quota ? (d.upgrade ?? null) : null,
        extras: {
          vizBlocked: d.vizBlocked,
          reportUrl: d.reportUrl,
          liveSources: d.liveSources,
          conflicts: d.conflicts,
        },
        chargeNote: chargeLine(d.charge, d.usage ? askEnergy(d.usage).daily.limit : undefined),
      }));
      if (d.ack) updateTurn(key, (t) => ({ ack: t.ack ?? d.ack ?? null }));
      updateTurn(key, {
        proposedAction: d.proposedAction?.id ? d.proposedAction : null,
        offer: d.offer ?? null,
      });
      // Keir reacts to how it went, then settles.
      setFlash(finishMood(d));
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
      stickRef.current = true;
      // On a phone, put the keyboard away so the answer gets the screen. Left
      // up, Safari pans the page under it and pushes the header off the top.
      if (window.matchMedia?.("(pointer: coarse)").matches) inputRef.current?.blur();
      setView("thread");
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = clientReqId();
      reqIdRef.current = reqId;
      const context = sharePage ? capturePageContext() : null;
      if (context) setPage(context);
      const startedAt = Date.now();
      setStepMood("thinking");
      setQuietPeriods(0);
      setRest(null);
      lastActivityRef.current = startedAt;
      try {
        const result = await askQuestion(
          {
            question: q.slice(0, MAX_QUESTION),
            clientReqId: reqId,
            convId: convId ?? undefined,
            mode,
            // Ask reads live game data whenever the question needs it.
            useMcp: true,
            visualizations: true,
            game: "ahd",
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...(context ? { pageContext: context } : {}),
          },
          controller.signal,
          (event) => {
            if (event.event === "meta" && event.data.convId) setConvId(event.data.convId);
            else if (event.event === "ack" && event.data.text) {
              const ack = event.data.text;
              updateTurn(turn.key, { ack });
              setFlash("nod");
            } else if (event.event === "status" && event.data.label) {
              const label = event.data.label;
              // The first real step ends the ack nod.
              setFlash(null);
              setStepMood(moodForStatus(label, event.data.phase));
              setQuietPeriods(0);
              updateTurn(turn.key, (t) => ({
                status: label,
                trail:
                  t.trail.length < 90 && t.trail.at(-1) !== label ? [...t.trail, label] : t.trail,
              }));
            } else if (event.event === "delta") {
              if (alertedRef.current !== turn.key) {
                alertedRef.current = turn.key;
                setAlerting(true);
                window.clearTimeout(alertTimerRef.current);
                alertTimerRef.current = window.setTimeout(() => setAlerting(false), ALERT_MS);
              }
              updateTurn(turn.key, (t) => ({ answer: t.answer + event.data }));
            }
          }
        );
        updateTurn(turn.key, { elapsedMs: Date.now() - startedAt });
        applyFinal(
          turn.key,
          result.payload ?? { error: "Ask did not finish that answer. It did not use any energy." }
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
        window.clearTimeout(alertTimerRef.current);
        setAlerting(false);
        setBusy(false);
        lastActivityRef.current = Date.now();
      }
    },
    [applyFinal, busy, convId, mode, question, sharePage, updateTurn]
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
          used_mcp?: number | boolean;
          feedback_rating?: string | null;
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
              usedMcp: !!t.used_mcp,
              feedback:
                t.feedback_rating === "up" || t.feedback_rating === "down"
                  ? t.feedback_rating
                  : null,
            }))
          )
        )
        .catch(() => setTurns([]));
    },
    [busy]
  );

  const feedback = useCallback(
    (turn: Turn, rating: "up" | "down", reason = "") => {
      if (!turn.answerId) return;
      updateTurn(turn.key, { feedback: rating });
      askJson("answer/feedback", { answerId: turn.answerId, rating, reason }).catch(() =>
        updateTurn(turn.key, { feedback: null })
      );
    },
    [updateTurn]
  );

  /** Make a public read-only link to this thread, as the Ask site's Share does. */
  const shareThread = useCallback(async (): Promise<string | null> => {
    if (!convId) return null;
    try {
      const d = await askJson<{ url?: string | null }>("conversation/share", { id: convId });
      const url = absoluteAskUrl(d.url ?? undefined);
      if (!url) return "Could not make a link";
      if (
        typeof navigator.share === "function" &&
        window.matchMedia?.("(pointer: coarse)").matches
      ) {
        await navigator.share({ title: "Ask Keir", url }).catch(() => undefined);
        return null;
      }
      await navigator.clipboard?.writeText(url);
      return "Link copied";
    } catch {
      return "Could not make a link";
    }
  }, [convId]);

  const startRename = useCallback((c: AskConversationSummary) => {
    setConfirmDelete(null);
    setRenaming(c.id);
    setRenameText(c.title || "");
  }, []);

  const finishRename = useCallback(
    (save: boolean) => {
      const id = renaming;
      const title = renameText.trim().slice(0, 120);
      setRenaming(null);
      if (!save || !id || !title) return;
      setConvs((all) => all.map((c) => (c.id === id ? { ...c, title } : c)));
      askJson("conversation/rename", { id, title }).catch(() => loadConvs(search.trim()));
    },
    [loadConvs, renameText, renaming, search]
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
      // On touch screens the delete button is always showing, so it takes two taps.
      if (confirmDelete !== c.id) {
        setConfirmDelete(c.id);
        return;
      }
      setConfirmDelete(null);
      askJson("conversation/delete", { id: c.id })
        .then(() => {
          if (c.id === convId) newThread();
          loadConvs(search.trim());
        })
        .catch(() => undefined);
    },
    [confirmDelete, convId, loadConvs, newThread, search]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!flash) return;
    // A one-shot reaction holds just long enough to play once.
    const state = KEIR_STATES[flash];
    const ms = state.loop ? 2500 : Math.max(700, (state.frames / state.fps) * 1000 + 150);
    const t = window.setTimeout(() => setFlash(null), ms);
    return () => window.clearTimeout(t);
  }, [flash]);

  const lastTurn = turns.at(-1);
  const answering = busy && !!lastTurn?.answer;
  const trailLength = lastTurn?.trail.length ?? 0;

  // A research step that runs long gets a rotation of waiting states.
  useEffect(() => {
    if (!busy || answering) return;
    const t = window.setInterval(() => setQuietPeriods((n) => n + 1), LONG_WAIT_MS);
    return () => window.clearInterval(t);
  }, [busy, answering, trailLength]);

  // Left alone with the drawer open, Keir yawns and dozes off.
  useEffect(() => {
    if (busy || rest) return;
    const t = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current < IDLE_SLEEP_MS) return;
      setRest("yawn");
      window.clearTimeout(restTimerRef.current);
      restTimerRef.current = window.setTimeout(() => setRest("sleeping"), 1400);
    }, 5000);
    return () => window.clearInterval(t);
  }, [busy, rest]);

  useEffect(
    () => () => {
      window.clearTimeout(alertTimerRef.current);
      window.clearTimeout(restTimerRef.current);
    },
    []
  );

  const noteActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (rest !== "yawn" && rest !== "sleeping") return;
    window.clearTimeout(restTimerRef.current);
    setRest("waking");
    restTimerRef.current = window.setTimeout(() => setRest(null), 700);
  }, [rest]);

  const filed = useCallback(() => setFlash("celebrate"), []);

  // Questions to offer for what is on screen, fetched when the drawer opens and
  // when the player moves to another page. The static starters show meanwhile.
  const empty = turns.length === 0;
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const pageKey = sharePage && page ? `${page.path}|${page.heading}` : "private";
  useEffect(() => {
    if (!empty) return;
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      const context = sharePage ? pageRef.current : null;
      suggestQuestions(context ? { pageContext: context } : {}, controller.signal)
        .then((d) => setSuggested(cleanSuggestions(d.questions)))
        .catch(() => undefined);
    }, 400);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [empty, pageKey, sharePage]);

  const keirMood = pickKeirMood({
    busy,
    answering,
    alerting,
    flash,
    stepMood,
    quietPeriods,
    typing: typing && !!question.trim(),
    rest,
  });
  const starters = suggested && suggested.length >= 3 ? suggested : STARTERS;

  const outOfEnergy = usage !== null && energySpent(usage);
  const fullAskUrl = convId ? `${ASK_SITE_URL}/?c=${encodeURIComponent(convId)}` : ASK_SITE_URL;
  const headerButton =
    "inline-flex h-10 w-10 shrink-0 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex h-full flex-col" onPointerDown={noteActivity} onKeyDown={noteActivity}>
      <header
        className="flex min-h-[56px] items-center gap-0.5 border-b border-card-border/70 px-3 py-2 sm:min-h-0"
        // On a phone the drawer is a sheet: a downward swipe on its header closes it.
        onTouchStart={(e) => {
          swipeRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          const start = swipeRef.current;
          swipeRef.current = null;
          const end = e.changedTouches[0]?.clientY;
          if (start !== null && end !== undefined && end - start > 80) onClose();
        }}
      >
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          {/* The empty drawer shows Keir large below; one Keir at a time. */}
          {(turns.length > 0 || view === "history") && (
            <KeirWithAlert mood={keirMood} alerting={alerting} avatar />
          )}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              Ask Keir
            </div>
            {view === "thread" && turns.length > 0 && (
              <div className="truncate text-[11px] leading-tight text-muted" aria-live="polite">
                {busy ? (lastTurn?.answer ? "Answering" : "Researching") : (planLabel ?? "Ready")}
              </div>
            )}
          </div>
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

      <div
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
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
              className="mb-3 w-full rounded-lg border border-card-border bg-background px-3 py-1.5 text-base text-foreground placeholder:text-muted focus:border-primary sm:text-[13px] focus:outline-none"
            />
            <div className="flex-1">
              {convs.length === 0 && (
                <p className="py-8 text-center text-[13px] text-muted">
                  {search ? "No threads match." : "No threads yet. Your questions show up here."}
                </p>
              )}
              {groupThreads(convs, !!search.trim()).map((group) => (
                <section key={group.label} className="mb-3">
                  <h4 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {group.label}
                  </h4>
                  {group.items.map((c) => (
                    <div
                      key={c.id}
                      className={`group flex items-center gap-0.5 rounded-md pl-2 hover:bg-card-elevated/60 ${c.id === convId ? "bg-card-elevated/60" : ""}`}
                    >
                      {renaming === c.id ? (
                        <input
                          autoFocus
                          value={renameText}
                          maxLength={120}
                          aria-label="Thread name"
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") finishRename(true);
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              finishRename(false);
                            }
                          }}
                          onBlur={() => finishRename(true)}
                          className="my-1 min-w-0 flex-1 rounded-md border border-primary bg-background px-2 py-1 text-base text-foreground focus:outline-none sm:text-[13px]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className="min-w-0 flex-1 py-2 text-left sm:py-1.5"
                          title={c.title || "Untitled"}
                        >
                          <span className="block truncate text-[14px] text-foreground sm:text-[13px]">
                            {c.title || "Untitled"}
                          </span>
                          {search.trim() && c.snippet && (
                            <span className="block truncate text-[12px] text-muted">
                              {c.snippet}
                            </span>
                          )}
                        </button>
                      )}
                      {renaming !== c.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => startRename(c)}
                            className={`${QUIET_BUTTON} ${TOUCH_VISIBLE}`}
                            aria-label="Rename thread"
                            title="Rename"
                          >
                            <Icon d={ICONS.pencil} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePin(c)}
                            className={`${QUIET_BUTTON} ${c.pinned ? "text-foreground" : TOUCH_VISIBLE}`}
                            aria-label={c.pinned ? "Unpin thread" : "Pin thread"}
                            aria-pressed={!!c.pinned}
                            title={c.pinned ? "Unpin" : "Pin"}
                          >
                            <Icon d={ICONS.pin} className="h-3.5 w-3.5" />
                          </button>
                          {confirmDelete === c.id ? (
                            <button
                              type="button"
                              onClick={() => remove(c)}
                              onBlur={() => setConfirmDelete(null)}
                              autoFocus
                              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white"
                              aria-label="Confirm delete thread"
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => remove(c)}
                              className={`${QUIET_BUTTON} ${TOUCH_VISIBLE}`}
                              aria-label="Delete thread"
                              title="Delete"
                            >
                              <Icon d={ICONS.trash} className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </section>
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
          <div className="pt-4">
            <KeirWithAlert mood={keirMood} alerting={alerting} scale={2} />
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
              Ask about this page
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              Answers from the game&apos;s live code, rules and data, with sources.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  disabled={busy || outOfEnergy || !!unavailable}
                  className="rounded-md border border-card-border bg-card-elevated/40 px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            {outOfEnergy && upgrade && <AskUpgradeCard offer={upgrade} />}
          </div>
        ) : (
          <div className="space-y-8">
            {turns.map((t) => (
              <TurnView
                key={t.key}
                turn={t}
                fullAskUrl={fullAskUrl}
                canShare={!!convId && !t.streaming}
                onFollowup={(f) => void submit(f)}
                onFeedback={feedback}
                onShare={shareThread}
                onFiled={filed}
                keir={
                  t === lastTurn && busy ? (
                    <KeirWithAlert mood={keirMood} alerting={alerting} avatar size={48} />
                  ) : undefined
                }
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
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value.slice(0, MAX_QUESTION));
                noteActivity();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              placeholder={turns.length ? "Ask a follow-up" : "Ask about any part of the game"}
              aria-label="Your question"
              // 16px on phones: iOS zooms into any focused field smaller than that.
              className="min-h-[44px] flex-1 resize-none bg-transparent text-base text-foreground sm:text-[14px] placeholder:text-muted focus:outline-none"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="mb-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-foreground text-background sm:h-8 sm:w-8"
                aria-label="Stop"
                title="Stop"
              >
                <Icon d={ICONS.stop} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={question.trim().length < 5 || !!unavailable}
                className="mb-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity disabled:bg-card-elevated disabled:text-muted sm:h-8 sm:w-8"
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
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ModeId)}
              aria-label="Answer mode"
              title={MODES.find((m) => m.id === mode)?.hint}
              className="ml-auto rounded-md border border-card-border bg-background px-1.5 py-0.5 text-base text-foreground focus:outline-none sm:text-[11px]"
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
