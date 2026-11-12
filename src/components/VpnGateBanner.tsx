"use client";

/**
 * Shown only while the signed-in player's game actions are blocked because
 * they are connected through a VPN. Tells them the two ways out: turn the VPN
 * off, or ask staff for VPN access in a Discord ticket.
 */
import { useEffect, useState } from "react";
import { useSignedIn } from "@/contexts/AuthDataContext";
import { COMMUNITY_DISCORD_URL } from "@/lib/communityLinks";

const POLL_INTERVAL_MS = 60_000;

export function VpnGateBanner() {
  const [gated, setGated] = useState(false);
  const signedIn = useSignedIn();

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auth/vpn-status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { gated?: boolean };
        if (!cancelled) setGated(body.gated === true);
      } catch {
        // Best-effort: the server still enforces the gate.
      }
    }
    void load();
    const handle = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [signedIn]);

  if (!signedIn || !gated) return null;

  return (
    <div className="border-b border-amber-700 bg-amber-600 text-white" role="alert">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
        <p className="text-sm">
          <span className="font-semibold">You&apos;re connected through a VPN.</span> Turn it off to
          play. If you need a VPN, open a ticket on Discord to ask for VPN access.
        </p>
        <a
          href={COMMUNITY_DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
        >
          Request VPN access
        </a>
      </div>
    </div>
  );
}
