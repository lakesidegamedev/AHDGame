"use client";

import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";

export interface HealPanelResult {
  ok: boolean;
  message: string;
}

/** Shared GET diagnosis and confirmed POST repair flow for the standard heal panels. */
export function useHealPanel<TDiagnostic>(endpoint: string, confirmation: string) {
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<TDiagnostic | null>(null);
  const [result, setResult] = useState<HealPanelResult | null>(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok) {
        setDiagnostic(data as TDiagnostic);
      } else {
        setResult({ ok: false, message: apiErrorText(data, "Diagnostic failed") });
      }
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const runHeal = async () => {
    if (!confirm(confirmation)) return;

    setLoading(true);
    setDiagnostic(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data: { message?: string } = await res.json();
      setResult({ ok: res.ok, message: data.message ?? apiErrorText(data, "Unknown response") });
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return { loading, diagnostic, result, runDiagnostic, runHeal };
}
