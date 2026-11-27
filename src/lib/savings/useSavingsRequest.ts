"use client";
import { useRef } from "react";

/** Retain an action identity until its reply is known, including network failures. */
export function useSavingsRequest() {
  const pending = useRef(new Map<string, string>());
  return async (path: string, input: Record<string, unknown>) => {
    const fingerprint = JSON.stringify([path, input]);
    const requestId = pending.current.get(fingerprint) ?? crypto.randomUUID();
    pending.current.set(fingerprint, requestId);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, requestId }),
    });
    const json = (await response.json()) as {
      error?: string;
      holderRouted?: boolean;
      holderError?: string;
    };
    if (response.ok || (response.status < 500 && response.status !== 409))
      pending.current.delete(fingerprint);
    return { response, json };
  };
}
