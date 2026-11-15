"use client";

import { useEffect, useId } from "react";

/**
 * Returns props that satisfy the dialog a11y contract.
 *
 * `aria-labelledby` matters: without it a screen reader announces only "dialog",
 * even when `role` and `aria-modal` are set.
 */
export function useDialogA11y(
  onClose: () => void,
  options: { closeOnEscape?: boolean } = {}
): {
  dialogProps: { role: "dialog"; "aria-modal": true; "aria-labelledby": string };
  titleId: string;
} {
  const titleId = useId();
  const closeOnEscape = options.closeOnEscape ?? true;

  useEffect(() => {
    if (!closeOnEscape) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeOnEscape, onClose]);

  return {
    dialogProps: { role: "dialog", "aria-modal": true, "aria-labelledby": titleId },
    titleId,
  };
}
