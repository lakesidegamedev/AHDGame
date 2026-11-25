"use client";
import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Flag,
  History,
  Map as MapIcon,
  Search,
  Share2,
  Store,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type AskActionReceipt,
  type AskAnswerPayload,
  type AskCitation,
  type AskUpgradeOffer,
  type AskProposedAction,
} from "@/components/askDrawer/askDrawerApi";

import { AskUpgradeCard } from "@/components/askDrawer/AskUpgradeCard";
import { ASK_SITE_URL } from "@/lib/askDrawer/askService";
import { isValidElement, type ReactNode } from "react";
import { AskChart, AskDiagram, AskMap, richKind } from "@/components/askDrawer/AskRichBlock";

import { AskActionCard } from "@/components/askDrawer/AskActionCard";

export interface Turn {
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
  /** The answer could not be recovered after a dropped connection; offer Retry. */
  retryable: boolean;
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
  /** A quiet "did this help?" line, only for answers that just finished. */
  ratePrompt: { text: string; lowConfidence: boolean } | null;
}

export /** A fenced block Ask draws (chart, map, diagram) rather than prints. */
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

export function absoluteAskUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, ASK_SITE_URL);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
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

export const ICONS = {
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

export const REPORT_REASONS = [
  "Wrong or outdated",
  "Didn't answer the question",
  "Missing sources",
  "Confusing",
  "Other",
];

export const MARKDOWN_CLASS =
  "text-[15px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-card-elevated [&_code]:px-1 [&_code]:text-[13px] [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p:last-child]:mb-0 [&_p]:mb-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-card-elevated [&_pre]:p-3 [&_table]:mb-3 [&_table]:w-full [&_table]:text-[13px] [&_td]:border-t [&_td]:border-card-border/60 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5";

export /** The typing caret, drawn at the end of the last paragraph or list item rather than on a line of its own. */
const STREAM_CARET =
  "[&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:ml-0.5 [&>p:last-child]:after:ml-0.5 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:inline-block [&>p:last-child]:after:inline-block [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:h-4 [&>p:last-child]:after:h-4 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:w-[3px] [&>p:last-child]:after:w-[3px] [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:animate-pulse [&>p:last-child]:after:animate-pulse [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:bg-foreground/60 [&>p:last-child]:after:bg-foreground/60 [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:align-middle [&>p:last-child]:after:align-middle [&>:is(p,ul,ol):last-child_:is(p,li):last-child]:after:content-[''] [&>p:last-child]:after:content-['']";

export const QUIET_BUTTON =
  "inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-card-elevated hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

export /** Report an answer: a reason chip plus optional detail, as on the Ask site. */
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
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:bg-card-elevated disabled:text-muted"
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

export type StepKind =
  "live" | "search" | "file" | "history" | "market" | "map" | "calc" | "community";

export const STEP_STYLE: Record<StepKind, { icon: LucideIcon; tint: string }> = {
  live: { icon: TrendingUp, tint: "bg-emerald-500/20 text-emerald-500" },
  search: { icon: Search, tint: "bg-blue-500/20 text-blue-500" },
  file: { icon: FileText, tint: "bg-slate-500/20 text-slate-500" },
  history: { icon: History, tint: "bg-violet-500/20 text-violet-500" },
  market: { icon: Store, tint: "bg-amber-500/20 text-amber-500" },
  map: { icon: MapIcon, tint: "bg-teal-500/20 text-teal-500" },
  calc: { icon: Calculator, tint: "bg-rose-500/20 text-rose-500" },
  community: { icon: Users, tint: "bg-pink-500/20 text-pink-500" },
};

/** Which kind of tool a narrated research step is, judged from its wording. */
export function stepKind(text: string): StepKind {
  const t = text.toLowerCase();
  if (/communit|discord|player|forum/.test(t)) return "community";
  if (/map|region|state map|geograph/.test(t)) return "map";
  if (/calculat|formula|math|simulat|project/.test(t)) return "calc";
  if (/market|price|commodit|trade|stock/.test(t)) return "market";
  if (/histor|past|earlier|change|trend/.test(t)) return "history";
  if (/live|current|pulling|game data|reading the game/.test(t)) return "live";
  if (/search|look|find/.test(t)) return "search";
  return "file";
}

export function StepIcon({ text, className = "h-4 w-4" }: { text: string; className?: string }) {
  const Glyph = STEP_STYLE[stepKind(text)].icon;
  return <Glyph className={className} aria-hidden />;
}

export /** The last three research steps as a small fanned deck; the newest sits on top. */
function ResearchDeck({ steps, working }: { steps: string[]; working: boolean }) {
  const shown = steps.slice(-3);
  return (
    <span className="relative inline-block h-9 w-10 shrink-0" aria-hidden data-ask-deck>
      {shown.map((step, i) => {
        const pos = shown.length - 1 - i;
        const style = STEP_STYLE[stepKind(step)];
        return (
          <span
            key={`${steps.length - pos}-${step}`}
            data-pos={pos}
            title={step}
            className={`ask-deck-card ${style.tint} ${pos === 0 && working ? "ask-deck-running" : ""}`}
          >
            <StepIcon text={step} className="h-4 w-4" />
          </span>
        );
      })}
    </span>
  );
}

export function StepList({ turn }: { turn: Turn }) {
  return (
    <ul className="space-y-1 text-[13px] text-muted" data-ask-steps>
      {turn.trail.map((step, i) => (
        <li key={`s${i}`} className="flex items-center gap-2">
          <StepIcon text={step} className="h-3.5 w-3.5 shrink-0" />
          <span>{step}</span>
        </li>
      ))}
    </ul>
  );
}

export const ROUND_BUTTON =
  "inline-flex items-center gap-1 rounded-full border border-card-border px-2.5 py-1 text-[12px] text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function TurnView({
  turn,
  fullAskUrl,
  canShare,
  onFollowup,
  onRetry,
  onFeedback,
  onShare,
  onFiled,
  keir,
}: {
  turn: Turn;
  fullAskUrl: string;
  canShare: boolean;
  onFollowup: (question: string) => void;
  onRetry: (turn: Turn) => void;
  onFeedback: (turn: Turn, rating: "up" | "down", reason?: string) => void;
  onShare: () => Promise<string | null>;
  onFiled: (receipt: AskActionReceipt) => void;
  /** Keir, shown beside the research steps while this answer is being worked on. */
  keir?: ReactNode;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  // What this answer has open or dismissed, in one state so the file stays
  // under the architecture audit's useState limit.
  const [shown, setShown] = useState({
    steps: false,
    sources: false,
    followups: false,
    rateDismissed: false,
  });
  const { steps: stepsOpen, sources: sourcesOpen, followups: followupsOpen, rateDismissed } = shown;
  const toggle = (key: "steps" | "sources" | "followups") =>
    setShown((v) => ({ ...v, [key]: !v[key] }));
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

  const liveSources = turn.extras.liveSources ?? [];
  const sourceCount = turn.citations.length + liveSources.length;
  const hasSourcesPanel = sourceCount > 0 || !!turn.chargeNote || turn.areas.length > 0;
  const working = turn.streaming && !turn.answer;
  const settled = !turn.streaming;
  const steps = turn.trail.length;
  const showRate =
    settled &&
    !!turn.ratePrompt?.text &&
    !!turn.answerId &&
    turn.feedback === null &&
    !rateDismissed &&
    !reporting;

  return (
    <article className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-card-elevated px-3.5 py-2 text-[15px] leading-snug text-foreground">
          {turn.question}
        </p>
      </div>

      {turn.ack && !turn.answer && <p className="text-[13px] text-muted">{turn.ack}</p>}

      {working && (
        <div>
          <div className="flex items-center gap-3">
            {keir}
            <ResearchDeck steps={turn.trail} working />
            <div className="min-w-0 flex-1" role="status" aria-live="polite">
              <p className="ask-shimmer truncate text-[14px] text-foreground">
                {turn.status || turn.trail.at(-1) || "Working"}
              </p>
            </div>
            {steps > 0 && (
              <button
                type="button"
                onClick={() => toggle("steps")}
                aria-expanded={stepsOpen}
                className="shrink-0 text-[12px] text-muted hover:text-foreground"
              >
                {stepsOpen ? "Hide" : `Show ${steps}`}
              </button>
            )}
          </div>
          {stepsOpen && steps > 0 && (
            <div className="mt-2 pl-1">
              <StepList turn={turn} />
            </div>
          )}
        </div>
      )}

      {settled && steps > 0 && (
        <div>
          <button
            type="button"
            onClick={() => toggle("steps")}
            aria-expanded={stepsOpen}
            className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1.5 text-[13px] text-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex -space-x-1.5" aria-hidden>
              {Array.from(new Set(turn.trail.map(stepKind)))
                .slice(0, 2)
                .map((kind) => {
                  const Glyph = STEP_STYLE[kind].icon;
                  return (
                    <span
                      key={kind}
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${STEP_STYLE[kind].tint}`}
                    >
                      <Glyph className="h-3 w-3" />
                    </span>
                  );
                })}
            </span>
            {`Researched ${steps} step${steps === 1 ? "" : "s"}${turn.elapsedMs ? ` in ${Math.max(1, Math.round(turn.elapsedMs / 1000))}s` : ""}`}
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${stepsOpen ? "rotate-90" : ""}`}
              aria-hidden
            />
          </button>
          {stepsOpen && (
            <div className="mt-2 pl-1">
              <StepList turn={turn} />
            </div>
          )}
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
      {turn.error && turn.retryable && (
        <button type="button" onClick={() => onRetry(turn)} className={ROUND_BUTTON}>
          Retry
        </button>
      )}
      {turn.upgrade && <AskUpgradeCard offer={turn.upgrade} />}
      {settled && turn.proposedAction && (
        <AskActionCard action={turn.proposedAction} onFiled={onFiled} />
      )}
      {settled &&
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

      {settled && turn.extras.vizBlocked && (
        <p className="text-[13px] text-muted">This one is answered in prose.</p>
      )}
      {settled && turn.extras.reportUrl && absoluteAskUrl(turn.extras.reportUrl) && (
        <a
          href={absoluteAskUrl(turn.extras.reportUrl) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13px] text-primary underline"
        >
          Open this report as its own shareable page
        </a>
      )}
      {settled &&
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

      {settled && turn.answer && (
        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={copy}
            className={QUIET_BUTTON}
            aria-label="Copy answer"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
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
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setReporting(true)}
                disabled={turn.feedback !== null}
                className={`${QUIET_BUTTON} ${turn.feedback === "down" ? "text-amber-400" : ""}`}
                aria-label="Report a problem with this answer"
                title="Report"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
          {canShare && (
            <button
              type="button"
              onClick={share}
              className={QUIET_BUTTON}
              aria-label="Share this thread"
              title="Share"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {hasSourcesPanel && (
            <button
              type="button"
              onClick={() => toggle("sources")}
              aria-expanded={sourcesOpen}
              className={`${ROUND_BUTTON} ml-1.5`}
            >
              Sources
              {sourceCount > 0 && <span className="text-muted/70">{sourceCount}</span>}
            </button>
          )}
          {note && (
            <span className="ml-2 text-[11px] text-emerald-400" role="status">
              {note}
            </span>
          )}
        </div>
      )}

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

      {showRate && turn.ratePrompt && (
        <div
          className="flex items-center gap-1 text-[12px] text-muted"
          role="group"
          aria-label="Rate this answer"
          data-ask-rate
        >
          {turn.ratePrompt.lowConfidence && (
            <span className="mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
          )}
          <span className="mr-1">{turn.ratePrompt.text}</span>
          <button
            type="button"
            onClick={() => onFeedback(turn, "up")}
            className={QUIET_BUTTON}
            aria-label="Yes, this helped"
            title="Yes"
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setReporting(true)}
            className={QUIET_BUTTON}
            aria-label="No, this did not help"
            title="No"
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShown((v) => ({ ...v, rateDismissed: true }))}
            className={QUIET_BUTTON}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {settled && hasSourcesPanel && sourcesOpen && (
        <div
          className="space-y-3 rounded-xl border border-card-border bg-card px-3.5 py-3 text-[13px]"
          data-ask-sources
        >
          {sourceCount > 0 && (
            <h3 className="font-semibold text-foreground">
              Sources <span className="font-normal text-muted">{sourceCount}</span>
            </h3>
          )}
          {turn.citations.length > 0 && (
            <section>
              <h4 className="mb-1.5 font-semibold text-foreground">Code and documentation</h4>
              <ul className="space-y-1">
                {turn.citations.map((c, i) => {
                  const url = absoluteAskUrl(c.url);
                  return (
                    <li key={i} className="flex items-baseline gap-2">
                      {c.kind && (
                        <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-muted">
                          {c.kind}
                        </span>
                      )}
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-foreground underline decoration-card-border underline-offset-2 hover:decoration-foreground"
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
            </section>
          )}
          {liveSources.length > 0 && (
            <section>
              <h4 className="mb-1.5 font-semibold text-foreground">Live game data read</h4>
              <ul className="space-y-1">
                {liveSources.map((s, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-foreground">
                    <TrendingUp className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                    {s.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(turn.chargeNote || turn.areas.length > 0) && (
            <section>
              <h4 className="mb-1.5 font-semibold text-foreground">About this answer</h4>
              {turn.chargeNote && <p className="text-muted">{turn.chargeNote}</p>}
              {turn.areas.length > 0 && (
                <p className="text-muted">Areas: {turn.areas.join(", ")}</p>
              )}
            </section>
          )}
        </div>
      )}

      {settled && turn.followups.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => toggle("followups")}
            aria-expanded={followupsOpen}
            className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-foreground"
          >
            Follow-up questions
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${followupsOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {followupsOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {turn.followups.slice(0, 3).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFollowup(f)}
                  className="rounded-full border border-card-border px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
