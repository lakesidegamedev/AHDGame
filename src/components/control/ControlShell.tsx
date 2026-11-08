"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { navFor } from "@/lib/staff/panelRegistry";
import { canWrite as roleCanWrite, type StaffRole } from "@/lib/staff/rules";
import { ControlPanelContext } from "./ControlContext";
import { ControlNav } from "./ControlNav";
import { ControlPalette } from "./ControlPalette";
import { ReadOnlyGuard } from "./ReadOnlyGuard";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  junior_dev: "Junior dev (read-only)",
};

export function ControlShell({
  role,
  username,
  children,
}: {
  role: StaffRole;
  username: string;
  children: ReactNode;
}) {
  const groups = useMemo(() => navFor(role), [role]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Full admin write access is checked per tier on the server; the shell only
  // needs to know whether the role can write at all.
  const canWrite = roleCanWrite(role, "moderator") || roleCanWrite(role, "admin");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ControlPanelContext.Provider value={{ role, canWrite }}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-14 z-20 flex h-11 items-center gap-3 border-b border-card-border bg-card px-3 sm:px-4">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-body-sm text-muted hover:bg-white/5 hover:text-foreground lg:hidden"
            aria-expanded={drawerOpen}
            aria-controls="control-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            Menu
          </button>
          <Link href="/control" className="text-body font-semibold text-foreground">
            Control panel
          </Link>
          <span className="rounded border border-card-border px-1.5 py-0.5 text-body-xs text-muted">
            {ROLE_LABEL[role]}
          </span>
          <span className="hidden text-body-sm text-muted sm:inline">{username}</span>
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="rounded-md border border-card-border px-2.5 py-1 text-body-sm text-muted hover:text-foreground"
            >
              Jump to tool <kbd className="ml-1 font-mono text-body-xs">Ctrl K</kbd>
            </button>
          </div>
        </header>
        <ReadOnlyGuard active={!canWrite} />
        <div className="lg:flex lg:items-start">
          <aside
            className="sticky top-[100px] hidden h-[calc(100vh-100px)] w-56 shrink-0 overflow-y-auto border-r border-card-border bg-card lg:block"
            aria-label="Tools"
          >
            <ControlNav groups={groups} />
          </aside>
          {drawerOpen && (
            <div
              id="control-drawer"
              className="fixed inset-x-0 top-[100px] bottom-0 z-30 overflow-y-auto border-b border-card-border bg-card lg:hidden"
            >
              <ControlNav groups={groups} onNavigate={() => setDrawerOpen(false)} />
            </div>
          )}
          <main className="min-w-0 max-w-[110rem] flex-1 px-3 py-4 sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
        <ControlPalette groups={groups} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </ControlPanelContext.Provider>
  );
}
