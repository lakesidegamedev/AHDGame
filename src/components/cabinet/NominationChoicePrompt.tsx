"use client";

import { useCallback, useEffect, useState } from "react";
import { useOptionalAuthMe } from "@/contexts/AuthDataContext";
import { fetchJson, HttpError } from "@/lib/observability/fetchJson";
import { Button } from "@/components/ui";

interface SeatOffer {
  nominationId: string;
  positionName: string;
  office: string;
  expiresOnTurn: number;
}

interface ChoiceResponse {
  choice: SeatOffer | null;
}

/**
 * A nominee can win the Senate vote and still be barred from the seat by a
 * central bank office. This asks them which one they want instead of voiding
 * the appointment in silence. Shell-level and deferred: it only renders when an
 * offer is actually open.
 */
export function NominationChoicePrompt() {
  const auth = useOptionalAuthMe();
  const hasCharacter = !!auth?.user?.character;
  const [offer, setOffer] = useState<SeatOffer | null>(null);
  const [busy, setBusy] = useState<"accept" | "remain" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<ChoiceResponse>("/api/cabinet/nomination-choice", {
        credentials: "same-origin",
        cache: "no-store",
        feature: "cabinet-nomination-choice",
      });
      setOffer(data?.choice ?? null);
    } catch {
      // A failed read must not block play; the next load retries.
      setOffer(null);
    }
  }, []);

  useEffect(() => {
    if (!hasCharacter) return;
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [hasCharacter, load]);

  const answer = async (decision: "accept" | "remain") => {
    if (!offer || busy) return;
    setBusy(decision);
    setError("");
    try {
      await fetchJson("/api/cabinet/nomination-choice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominationId: offer.nominationId, decision }),
        credentials: "same-origin",
        feature: "cabinet-nomination-choice",
      });
      setOffer(null);
      auth?.refetch?.(true);
    } catch (e) {
      setError(
        e instanceof HttpError && e.serverMessage
          ? e.serverMessage
          : "That answer could not be saved. Please try again."
      );
      setBusy(null);
    }
  };

  if (!offer) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 py-8"
      role="dialog"
      aria-modal
    >
      <div
        className="absolute inset-0 backdrop-blur-[2px]"
        style={{ background: "var(--modal-backdrop)" }}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-card-border bg-card shadow-2xl">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            A cabinet seat is yours to decide on
          </h2>
          <p className="mt-1 text-sm text-muted">
            The Senate passed your nomination for {offer.positionName}, but you currently hold a{" "}
            {offer.office}, and the game does not allow both at once.
          </p>
          <p className="mt-2 text-sm text-muted">
            Take the seat and give up the {offer.office}, or stay where you are. If you do not
            answer, the offer lapses and the seat returns to the President.
          </p>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              className="border border-card-border bg-transparent"
              onClick={() => void answer("remain")}
              disabled={!!busy}
            >
              {busy === "remain" ? "Saving..." : "Stay where I am"}
            </Button>
            <Button onClick={() => void answer("accept")} disabled={!!busy}>
              {busy === "accept" ? "Saving..." : `Take the ${offer.positionName}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
