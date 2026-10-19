"use client";

import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "gov" | "up" | "down" | "warning";
}) {
  const toneClass =
    tone === "up"
      ? "text-success"
      : tone === "down"
        ? "text-error"
        : tone === "warning"
          ? "text-warning"
          : tone === "gov"
            ? "text-gov-soft"
            : "text-foreground";
  return (
    <div>
      <div className="dossier-label !text-[9px] text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-[14px] font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-card-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="mt-2 text-[13px] leading-relaxed text-muted">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-card-border px-4 py-2 text-[13px] font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-[13px] font-semibold text-error hover:bg-error/20"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
