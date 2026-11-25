"use client";

import Link from "next/link";
import { useOptionalAuthMe } from "@/contexts/AuthDataContext";

export function NavMailLink({ className }: { className: string }) {
  const count = useOptionalAuthMe()?.navData?.unreadMailCount ?? 0;
  return (
    <Link
      href="/notifications?tab=mail"
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      aria-label={count > 0 ? `Mail (${count} unread)` : "Mail"}
      title="Mail"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full border-2 border-card bg-primary px-1 text-center text-body-sm font-bold leading-4 text-primary-foreground"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
