"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { groupIdForPath, type SectionTreeGroup } from "@/lib/wiki/rules/sectionTree";

const HEADER_OFFSET = 49;

const EXTRA_LINKS = [
  { title: "Election history", href: "/wiki/elections" },
  { title: "Roadmap", href: "/wiki/roadmap" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function moveSection(direction: 1 | -1) {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("[data-wiki-article] h2[id]"));
  if (headings.length === 0) return;
  const line = HEADER_OFFSET + 24;
  let current = -1;
  headings.forEach((h, i) => {
    if (h.getBoundingClientRect().top <= line) current = i;
  });
  const next = headings[Math.min(headings.length - 1, Math.max(0, current + direction))];
  next?.scrollIntoView({ block: "start" });
}

function useWikiKeys(openTree: () => void) {
  const openRef = useRef(openTree);
  useEffect(() => {
    openRef.current = openTree;
  });
  useEffect(() => {
    let pendingG = 0;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("input[data-wiki-search]");
        if (!search) return;
        e.preventDefault();
        search.focus();
        return;
      }
      if (e.key === "j" || e.key === "k") {
        moveSection(e.key === "j" ? 1 : -1);
        return;
      }
      if (e.key === "g") {
        pendingG = Date.now();
        return;
      }
      if (e.key === "t" && Date.now() - pendingG < 900) {
        pendingG = 0;
        const tree = document.querySelector<HTMLElement>("[data-wiki-tree]");
        if (tree && tree.offsetParent === null) openRef.current();
        window.setTimeout(() => {
          document
            .querySelector<HTMLElement>(
              "[data-wiki-tree] a[aria-current='page'], [data-wiki-tree] a"
            )
            ?.focus();
        }, 0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function itemClass(active: boolean): string {
  return `block rounded-md px-2.5 py-[3px] text-[13px] leading-snug ${
    active
      ? "bg-primary font-semibold text-primary-foreground"
      : "text-muted hover:bg-card hover:text-foreground"
  }`;
}

function SectionTree({ groups, pathname }: { groups: SectionTreeGroup[]; pathname: string }) {
  const currentGroup = groupIdForPath(groups, pathname);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => manual[id] ?? id === currentGroup;

  function toggle(id: string) {
    setManual((prev) => ({ ...prev, [id]: !(prev[id] ?? id === currentGroup) }));
  }

  const link = (href: string, title: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={itemClass(active)}
      >
        {title}
      </Link>
    );
  };

  return (
    <nav aria-label="Wiki sections" data-wiki-tree className="px-2.5 py-5">
      <div className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        All sections
      </div>
      <div className="mb-3">{link("/wiki", "Wiki home")}</div>
      {groups.map((g) => {
        const expanded = isOpen(g.id);
        return (
          <div key={g.id} className="mb-1.5">
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1 text-left text-[11px] font-bold text-foreground hover:bg-card"
            >
              <span>{g.name}</span>
              <Chevron open={expanded} />
            </button>
            {expanded && (
              <div className="mt-0.5">
                {link(g.overviewHref, "Overview")}
                {g.pages.map((p) => link(p.href, p.title))}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-4 border-t border-card-border pt-3">
        {EXTRA_LINKS.map((l) => link(l.href, l.title))}
      </div>
    </nav>
  );
}

export function WikiShell({
  groups,
  children,
}: {
  groups: SectionTreeGroup[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sheetPath, setSheetPath] = useState<string | null>(null);
  const sheetOpen = sheetPath === pathname;
  const setSheetOpen = (open: boolean) => setSheetPath(open ? pathname : null);
  useWikiKeys(() => setSheetPath(pathname));

  const currentGroup = groups.find((g) => g.id === groupIdForPath(groups, pathname));
  const currentPage = currentGroup?.pages.find((p) => p.href === pathname);
  const barLabel = currentPage?.title ?? currentGroup?.name ?? "Wiki";

  return (
    <div className="lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-expanded={sheetOpen}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-semibold text-foreground lg:hidden"
        style={{ background: "var(--card-muted)" }}
      >
        <span className="truncate">{barLabel}</span>
        <span className="shrink-0 pl-3 font-normal text-muted">Browse sections</span>
      </button>

      {sheetOpen && (
        <button
          type="button"
          aria-label="Close sections"
          onClick={() => setSheetOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <aside
        className={`${
          sheetOpen
            ? "fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto rounded-t-xl shadow-xl"
            : "hidden"
        } lg:sticky lg:top-[49px] lg:z-auto lg:block lg:h-[calc(100vh-49px)] lg:overflow-y-auto lg:rounded-none lg:shadow-none`}
        style={{ background: "var(--card-muted)" }}
      >
        {sheetOpen && (
          <div className="flex justify-end px-3 pt-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="rounded-md px-2 py-1 text-[13px] text-muted hover:text-foreground"
            >
              Close
            </button>
          </div>
        )}
        <SectionTree groups={groups} pathname={pathname} />
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
