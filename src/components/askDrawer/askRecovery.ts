// When an answer stream drops, Ask usually keeps working and saves the answer
// to the conversation. These helpers go and fetch it.

import { askJson, type AskAnswerPayload } from "./askDrawerApi";

export const RECOVERY_POLL_MS = 3_000;
export const RECOVERY_GIVE_UP_MS = 120_000;

interface SavedTurn {
  question?: string;
  answer?: string;
  citations?: AskAnswerPayload["citations"];
  areas?: string[];
  id?: number;
  used_mcp?: number | boolean;
}

interface RecoverOptions {
  convId: string;
  question: string;
  /** Answer ids already on screen, so an older identical question is not mistaken for this one. */
  knownAnswerIds: ReadonlySet<number>;
  signal: AbortSignal;
  pollMs?: number;
  giveUpMs?: number;
  fetchConversation?: (convId: string) => Promise<{ turns?: SavedTurn[] }>;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

function defaultFetch(convId: string) {
  return askJson<{ turns?: SavedTurn[] }>(`conversation?id=${encodeURIComponent(convId)}`);
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/** The newest saved turn for this question that has an answer and is not already shown. */
export function findFinishedAnswer(
  turns: SavedTurn[],
  question: string,
  knownAnswerIds: ReadonlySet<number>
): AskAnswerPayload | null {
  const wanted = question.trim();
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if ((turn.question ?? "").trim() !== wanted) continue;
    if (!turn.answer?.trim()) continue;
    if (typeof turn.id === "number" && knownAnswerIds.has(turn.id)) continue;
    return {
      answer: turn.answer,
      answerId: turn.id,
      citations: turn.citations ?? [],
      areas: turn.areas ?? [],
      usedMcp: !!turn.used_mcp,
    };
  }
  return null;
}

/**
 * Poll the saved conversation every few seconds until the finished answer
 * appears. Returns null if it never does, or if the player stopped waiting.
 */
export async function recoverFinishedAnswer(
  options: RecoverOptions
): Promise<AskAnswerPayload | null> {
  const {
    convId,
    question,
    knownAnswerIds,
    signal,
    pollMs = RECOVERY_POLL_MS,
    giveUpMs = RECOVERY_GIVE_UP_MS,
    fetchConversation = defaultFetch,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const deadline = now() + giveUpMs;
  while (!signal.aborted) {
    await sleep(pollMs, signal);
    if (signal.aborted) break;
    try {
      const found = findFinishedAnswer(
        (await fetchConversation(convId)).turns ?? [],
        question,
        knownAnswerIds
      );
      if (found) return found;
    } catch {
      // A failed poll is just a poll that found nothing; keep trying until the deadline.
    }
    if (now() >= deadline) break;
  }
  return null;
}
