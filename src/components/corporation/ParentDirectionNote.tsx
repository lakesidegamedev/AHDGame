"use client";

import Link from "next/link";
import { useState } from "react";
import { apiErrorText } from "@/lib/errors/catalog";
import { PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS } from "@/lib/constants/sectorStrategyTypes";

interface ParentDirectionNoteProps {
  corpId: string;
  parent: { _id: string; sequentialId?: number; name: string };
  onRefresh: () => void;
}

/**
 * Shown to the controlling parent's CEO on an AI-run subsidiary: names the
 * parent and offers the logo upload. Sector strategy selectors on this page
 * are enabled for the same viewer; the server re-checks both.
 */
export function ParentDirectionNote({ corpId, parent, onRefresh }: ParentDirectionNoteProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const parentHref = `/corporation/${parent.sequentialId ?? parent._id}`;

  async function onLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("corporationId", corpId);
      const res = await fetch("/api/upload/corporation-logo", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Logo updated" });
        onRefresh();
      } else {
        setMessage({ type: "error", text: apiErrorText(data, "Upload failed") });
      }
    } catch {
      setMessage({ type: "error", text: "Upload failed" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <section
      aria-label="Parent management"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-card-border bg-card px-4 py-3 text-sm"
    >
      <p className="text-muted">
        Managed by{" "}
        <Link href={parentHref} className="font-medium text-foreground hover:underline">
          {parent.name}
        </Link>
        . As its parent&apos;s CEO you can retool this company&apos;s sectors and change its logo.
        The AI manager will not undo a strategy you choose for{" "}
        {PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS} turns.
      </p>
      <div className="flex items-center gap-3">
        {message && (
          <span
            role="status"
            className={message.type === "error" ? "text-xs text-red-500" : "text-xs text-muted"}
          >
            {message.text}
          </span>
        )}
        <label className="cursor-pointer rounded border border-card-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background">
          {uploading ? "Uploading..." : "Change logo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={uploading}
            onChange={onLogoUpload}
          />
        </label>
      </div>
    </section>
  );
}
