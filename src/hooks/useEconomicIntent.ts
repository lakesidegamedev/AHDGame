"use client";
import { useCallback, useRef } from "react";

/** A retry of an unanswered paid request keeps its identity until a successful reply. */
export function useEconomicIntent() {
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  return useCallback(async (url: string, body: unknown): Promise<Response> => {
    const encoded = JSON.stringify(body),
      fingerprint = JSON.stringify([url, encoded]);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const intent = pending.current;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": intent.key },
      body: encoded,
    });
    if (response.ok && pending.current === intent) pending.current = null;
    return response;
  }, []);
}
