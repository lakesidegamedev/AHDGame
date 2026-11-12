"use client";
import { useEffect, useState } from "react";
import { fetchDerivedPreviews } from "@/lib/positionEditor/previewClient";
import type { DerivedComposition, EditorStateConfig } from "@/lib/positionEditor/types";

const DEBOUNCE_MS = 200;

/**
 * Census preview for the config being edited. Keeps the last result on screen
 * while the next one loads, and drops responses for configs that have moved on.
 */
export function useDerivedPreview(config: EditorStateConfig | null): DerivedComposition | null {
  const [derived, setDerived] = useState<DerivedComposition | null>(null);

  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchDerivedPreviews([config], controller.signal)
        .then(([next]) => {
          if (next) setDerived(next);
        })
        .catch(() => {
          // Aborted by a newer edit, or the preview is unavailable; keep the last result.
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [config]);

  return derived;
}
