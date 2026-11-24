"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui";

/** The server's plain refusal text, without the error code suffix. */
export function operatingReserveRefusalText(body: unknown): string {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return typeof error === "string" && error.length > 0
    ? error
    : "This purchase would leave too little cash to run your plants.";
}

/** A refused company purchase waiting on the CEO's confirm. */
export interface OperatingReserveConfirmState {
  pending: { message: string } | null;
  busy: boolean;
  /** Show the warning; `retry` sends the same purchase with the confirm flag. */
  ask: (message: string, retry: () => Promise<unknown> | void) => void;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/**
 * Holds a company share-market purchase the server refused for the operating
 * reserve, so the CEO can read why and confirm it. Mirrors the build dialog's
 * "build past reserve" step.
 */
export function useOperatingReserveConfirm(): OperatingReserveConfirmState {
  const [pending, setPending] = useState<{
    message: string;
    retry: () => Promise<unknown> | void;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = useCallback(
    (message: string, retry: () => Promise<unknown> | void) => setPending({ message, retry }),
    []
  );
  const cancel = useCallback(() => setPending(null), []);
  const confirm = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      setPending(null);
      await pending.retry();
    } finally {
      setBusy(false);
    }
  }, [pending]);
  return { pending: pending ? { message: pending.message } : null, busy, ask, confirm, cancel };
}

/** The warning and confirm button for a purchase below the operating reserve. */
export function OperatingReserveConfirmDialog({ state }: { state: OperatingReserveConfirmState }) {
  if (!state.pending) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="operating-reserve-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-warning/40 bg-card p-5 shadow-modal space-y-3"
      >
        <h3 id="operating-reserve-confirm-title" className="text-sm font-semibold text-foreground">
          This leaves your plants short of cash
        </h3>
        <p className="text-xs leading-relaxed text-muted">{state.pending.message}</p>
        <p className="text-xs leading-relaxed text-muted">
          A plant that cannot pay its wages and inputs runs short or stops next turn.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={state.cancel} disabled={state.busy} className="text-sm">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void state.confirm()}
            disabled={state.busy}
            isLoading={state.busy}
            className="text-sm"
          >
            Buy anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
