"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { visibleWorldNavItems, type WorldNavOpts } from "@/components/navbar/worldNavItems";

interface MobileWorldLinksProps extends WorldNavOpts {
  pathname: string;
  onNavigate: () => void;
}

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * World section of the mobile hamburger menu. Lives in its own module so the
 * world link catalogue is not part of the first-paint navbar chunk; the
 * section only mounts when the World group is expanded.
 */
export function MobileWorldLinks({ pathname, onNavigate, ...opts }: MobileWorldLinksProps) {
  const t = useTranslations("nav");

  return (
    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-card-border/60 pl-3">
      {visibleWorldNavItems(opts).map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={onNavigate}
          className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${
            item.primary
              ? isNavActive(pathname, item.href)
                ? "bg-white/5 font-medium"
                : "text-primary"
              : isNavActive(pathname, item.href) ||
                  (item.id === "stockMarket" && pathname.includes("/stockmarket")) ||
                  (item.id === "forex" && pathname.includes("/forex"))
                ? "bg-white/5 font-medium"
                : "text-muted"
          }`}
          aria-current={
            isNavActive(pathname, item.href) ||
            (item.id === "stockMarket" && pathname.includes("/stockmarket")) ||
            (item.id === "forex" && pathname.includes("/forex"))
              ? "page"
              : undefined
          }
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </div>
  );
}
