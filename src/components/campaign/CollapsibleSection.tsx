"use client";

import { useState, type ReactNode } from "react";
import { BLEND, BLEND_LABEL } from "@/components/blend/tokens";

/**
 * One block of the map's state panel with a label that folds it away, so the
 * panel stays short when several campaign sections are on offer. The body is
 * not mounted while folded. `openWhen` opens it when it turns true (the player
 * just did something that needs it on screen) and leaves it alone otherwise.
 */
export function CollapsibleSection({
  label,
  defaultOpen = false,
  openWhen = false,
  testId,
  children,
}: {
  label: ReactNode;
  defaultOpen?: boolean;
  openWhen?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || openWhen);
  const [wasOpenWhen, setWasOpenWhen] = useState(openWhen);
  if (openWhen !== wasOpenWhen) {
    setWasOpenWhen(openWhen);
    if (openWhen) setOpen(true);
  }
  return (
    <div data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...BLEND_LABEL,
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: 0,
          border: 0,
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span>{label}</span>
        <span aria-hidden style={{ color: BLEND.mutedDim }}>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}
