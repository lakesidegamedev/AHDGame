"use client";

import { BLEND } from "@/components/blend/tokens";

/** A spinner and a line of text, so a panel that is still loading never reads as empty. */
export function LoadingBlock({ label, minHeight = 120 }: { label: string; minHeight?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: 12,
        background: BLEND.inset,
        color: BLEND.muted,
        fontSize: 12,
      }}
    >
      <span
        aria-hidden
        className="animate-spin"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: `2px solid ${BLEND.hairlineStrong}`,
          borderTopColor: "transparent",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
