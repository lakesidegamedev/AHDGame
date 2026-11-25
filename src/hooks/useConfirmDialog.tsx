"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the confirm button is disabled and this reason is shown. */
  confirmDisabledReason?: string;
}

/**
 * In-page replacement for `window.confirm()`.
 *
 * Embedded webviews do not all implement the native JS dialogs: the iOS app's
 * WKWebView answers `confirm()` with false and never shows anything, so a
 * guarded action silently does nothing. Render `dialog` somewhere in the tree
 * and `await confirm({...})` where the native call used to be.
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmDialogOptions) => {
    // A second request supersedes an unanswered first one.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const cancel = useCallback(() => settle(false), [settle]);

  const dialog = (
    <Modal open={options !== null} title={options?.title ?? ""} onClose={cancel}>
      <p className="whitespace-pre-line text-body text-muted">{options?.message}</p>
      {options?.confirmDisabledReason ? (
        <p className="mt-3 text-body font-semibold text-error">{options.confirmDisabledReason}</p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={cancel}>
          {options?.cancelLabel ?? "Cancel"}
        </Button>
        <Button
          variant={options?.destructive ? "destructive" : "primary"}
          onClick={() => settle(true)}
          disabled={Boolean(options?.confirmDisabledReason)}
        >
          {options?.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
