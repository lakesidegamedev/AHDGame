"use client";

import { useEffect, useState } from "react";
import {
  askJson,
  confirmAction,
  type AskActionReceipt,
  type AskProposedAction,
} from "@/components/askDrawer/askDrawerApi";

// A suggestion or ticket Keir drafted from the conversation. Nothing is filed
// until the player reads it, edits it if they like, and presses Send. Filing
// is free: it never uses energy.

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

export const DISCORD_LINK_HREF = "/settings?section=identity";

/** When the draft stops being sendable, in epoch ms, or null if it does not say. */
function expiryOf(action: AskProposedAction): number | null {
  if (action.expiresAt === undefined) return null;
  const at = typeof action.expiresAt === "number" ? action.expiresAt : Date.parse(action.expiresAt);
  return Number.isFinite(at) ? at : null;
}

function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function AskReceipt({ receipt }: { receipt: AskActionReceipt }) {
  if (receipt.kind === "suggestion") {
    return (
      <p className="text-[13px] text-foreground">
        <a href={`/feedback/${receipt.number}`} className="font-semibold text-primary underline">
          Suggestion #{receipt.number}
        </a>{" "}
        filed. Thanks.
      </p>
    );
  }
  const url = safeUrl(receipt.url);
  return (
    <p className="text-[13px] text-foreground">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-primary underline"
        >
          Ticket #{receipt.number}
        </a>
      ) : (
        <b className="font-semibold">Ticket #{receipt.number}</b>
      )}{" "}
      opened. Staff will reply in your ticket channel on Discord.
    </p>
  );
}

export function AskActionCard({
  action,
  onFiled,
}: {
  action: AskProposedAction;
  onFiled?: (receipt: AskActionReceipt) => void;
}) {
  const [title, setTitle] = useState(action.title.slice(0, TITLE_MAX));
  const [description, setDescription] = useState(action.description.slice(0, DESCRIPTION_MAX));
  const [state, setState] = useState<"draft" | "sending" | "done" | "cancelled">("draft");
  const [receipt, setReceipt] = useState<AskActionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsDiscordLink, setNeedsDiscordLink] = useState(false);
  const [expired, setExpired] = useState(false);
  const isSuggestion = action.kind === "suggestion";
  const stale = state === "draft" && expired;

  useEffect(() => {
    const at = expiryOf(action);
    if (at === null) return;
    // Timers cap out near 24 days; drafts last minutes.
    const t = window.setTimeout(
      () => setExpired(true),
      Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1)
    );
    return () => window.clearTimeout(t);
  }, [action]);

  const send = async () => {
    if (state !== "draft" || !title.trim() || !description.trim()) return;
    setState("sending");
    setError(null);
    const result = await confirmAction({
      actionId: action.id,
      title: title.trim(),
      description: description.trim(),
    });
    if (result.ok) {
      setReceipt(result.receipt);
      setState("done");
      onFiled?.(result.receipt);
      return;
    }
    setError(result.error);
    setNeedsDiscordLink(result.needsDiscordLink === true);
    setState("draft");
  };

  const cancel = () => {
    setState("cancelled");
    askJson("action/cancel", { actionId: action.id }).catch(() => undefined);
  };

  if (state === "done" && receipt) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <AskReceipt receipt={receipt} />
      </div>
    );
  }
  if (state === "cancelled") {
    return <p className="text-[13px] text-muted">Not filed.</p>;
  }

  const field =
    "w-full rounded-lg border border-card-border bg-background px-2.5 py-1.5 text-base text-foreground focus:border-primary focus:outline-none disabled:opacity-60 sm:text-[13px]";
  return (
    <section
      aria-label={isSuggestion ? "Suggestion draft" : "Ticket draft"}
      className="space-y-2 rounded-xl border border-primary/30 bg-card-elevated/40 p-3"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
          {isSuggestion ? "Suggestion" : "Support ticket"}
        </span>
        <span className="text-[11px] text-muted">Free. Nothing is sent until you press Send.</span>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          disabled={state === "sending" || stale}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Details</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          disabled={state === "sending" || stale}
          rows={5}
          className={`${field} resize-y`}
        />
      </label>
      {stale && (
        <p className="text-[12px] text-muted">This draft expired. Ask again to make a new one.</p>
      )}
      {error && (
        <p className="text-[12px] text-amber-400" role="alert">
          {error}
          {needsDiscordLink && (
            <>
              {" "}
              <a href={DISCORD_LINK_HREF} className="text-primary underline">
                Connect Discord in settings
              </a>
            </>
          )}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={state === "sending"}
          className="min-h-[44px] rounded-lg px-3 text-[13px] text-muted hover:text-foreground disabled:opacity-50 sm:min-h-0 sm:py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={state === "sending" || stale || !title.trim() || !description.trim()}
          className="min-h-[44px] rounded-lg bg-primary px-3 text-[13px] font-semibold text-white disabled:bg-card-elevated disabled:text-muted sm:min-h-0 sm:py-1.5"
        >
          {state === "sending" ? "Sending…" : "Send"}
        </button>
      </div>
    </section>
  );
}
