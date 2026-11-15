"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toolPath, type NavGroup } from "@/lib/staff/panelRegistry";

interface ControlPaletteProps {
  groups: NavGroup[];
  open: boolean;
  onClose: () => void;
}

/** Jump-to-tool search (Ctrl/Cmd+K). Lists only tools the viewer can open. */
export function ControlPalette({ groups, open, onClose }: ControlPaletteProps) {
  // Mounted only while open so each opening starts with a clean query.
  return open ? <PaletteDialog groups={groups} onClose={onClose} /> : null;
}

function PaletteDialog({ groups, onClose }: Omit<ControlPaletteProps, "open">) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () =>
      groups.flatMap(({ area, tools }) =>
        tools.map((tool) => ({
          tool,
          area: area.label,
          haystack: `${tool.label} ${area.label} ${tool.keywords ?? ""}`.toLowerCase(),
        }))
      ),
    [groups]
  );

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => terms.every((t) => e.haystack.includes(t))).slice(0, 12);
  }, [entries, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const go = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    router.push(toolPath(hit.tool));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Jump to tool"
        className="w-full max-w-lg overflow-hidden rounded-lg border border-card-border bg-card shadow-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(cursor);
            }
          }}
          placeholder="Jump to a tool"
          className="w-full border-b border-card-border bg-transparent px-4 py-3 text-body outline-none placeholder:text-muted"
        />
        <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-3 text-body-sm text-muted">No match</li>}
          {results.map((r, i) => (
            <li key={r.tool.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(i)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-body-sm ${
                  i === cursor ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                <span>{r.tool.label}</span>
                <span className="text-body-xs text-muted">{r.area}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
