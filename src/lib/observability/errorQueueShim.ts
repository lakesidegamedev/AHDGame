/**
 * Tiny stand-in for the Sentry browser SDK on anonymous public pages. It keeps
 * the first few uncaught errors and unhandled rejections so they can be replayed
 * into the SDK once that loads, and tells the caller to load it right away when
 * one happens. No SDK code lives here, so it stays out of the critical path.
 */

export type QueuedError = { kind: "error" | "unhandledrejection"; reason: unknown };

export const ERROR_QUEUE_LIMIT = 20;

type ShimWindow = Pick<Window, "addEventListener" | "removeEventListener">;

export interface ErrorShim {
  /** Remove the listeners. Queued errors stay available through `drain`. */
  uninstall(): void;
  /** Return and clear the queued errors, oldest first. */
  drain(): QueuedError[];
}

export function installErrorShim(win: ShimWindow, onFirstError: () => void): ErrorShim {
  const queue: QueuedError[] = [];
  const push = (entry: QueuedError) => {
    if (queue.length < ERROR_QUEUE_LIMIT) queue.push(entry);
    onFirstError();
  };
  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    push({ kind: "error", reason: error ?? message ?? "Script error" });
  };
  const onRejection = (event: Event) => {
    push({ kind: "unhandledrejection", reason: (event as PromiseRejectionEvent).reason });
  };
  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return {
    uninstall() {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    },
    drain() {
      return queue.splice(0, queue.length);
    },
  };
}

export const SENTRY_LOAD_FALLBACK_MS = 30_000;
export const SENTRY_LOAD_INTERACTIONS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

interface LoadTriggerEnv extends ShimWindow {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/**
 * Calls `load` once: on first interaction, after the fallback delay while the
 * tab is visible, or when the tab becomes visible after that. Returns a cancel.
 */
export function scheduleSentryLoad(
  env: LoadTriggerEnv,
  doc: {
    visibilityState: string;
    addEventListener: Document["addEventListener"];
    removeEventListener: Document["removeEventListener"];
  },
  load: () => void
): () => void {
  let done = false;
  let timer: number | undefined;
  const finish = () => {
    if (done) return;
    done = true;
    cancel();
    load();
  };
  const onVisible = () => {
    if (doc.visibilityState === "visible") finish();
  };
  function cancel() {
    if (timer !== undefined) env.clearTimeout(timer);
    for (const name of SENTRY_LOAD_INTERACTIONS) env.removeEventListener(name, finish);
    doc.removeEventListener("visibilitychange", onVisible);
  }
  for (const name of SENTRY_LOAD_INTERACTIONS) {
    env.addEventListener(name, finish, { once: true, passive: true });
  }
  timer = env.setTimeout(() => {
    if (doc.visibilityState === "visible") finish();
    else doc.addEventListener("visibilitychange", onVisible);
  }, SENTRY_LOAD_FALLBACK_MS);
  return () => {
    done = true;
    cancel();
  };
}
