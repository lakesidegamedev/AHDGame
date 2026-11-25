"use client";

import { useEffect, useRef, useState } from "react";
import type { WikiHeading } from "@/lib/wiki/headings";

const LINE = 49 + 32;

function useActiveHeading(headings: WikiHeading[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const ids = headings.filter((h) => h.level === 2).map((h) => h.id);
    function update() {
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= LINE) current = id;
      }
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [headings]);
  return active;
}

function linkClass(level: number, active: boolean): string {
  return `block py-[3px] text-body-sm leading-snug ${level === 3 ? "pl-3" : ""} ${
    active ? "font-semibold text-foreground" : "text-muted hover:text-foreground"
  }`;
}

/** Right-rail contents on desktop, a small dropdown on phones. */
export function WikiContentsList({
  headings,
  variant,
}: {
  headings: WikiHeading[];
  variant: "rail" | "dropdown";
}) {
  const active = useActiveHeading(headings);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  if (headings.length === 0) return null;

  const links = headings.map((h) => (
    <a
      key={h.id}
      href={`#${h.id}`}
      className={linkClass(h.level, h.id === active)}
      aria-current={h.id === active ? "location" : undefined}
      onClick={() => detailsRef.current?.removeAttribute("open")}
    >
      {h.text}
    </a>
  ));

  if (variant === "dropdown") {
    return (
      <details ref={detailsRef} className="mb-5 text-body-sm xl:hidden">
        <summary className="cursor-pointer select-none text-body-sm font-semibold text-foreground">
          On this page
        </summary>
        <nav aria-label="On this page" className="mt-2">
          {links}
        </nav>
      </details>
    );
  }

  return (
    <nav aria-label="On this page">
      <div className="mb-1.5 text-body-sm font-semibold uppercase tracking-[0.06em] text-muted">
        On this page
      </div>
      {links}
    </nav>
  );
}
