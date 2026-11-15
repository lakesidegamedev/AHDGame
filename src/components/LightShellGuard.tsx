"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hardNavigationTarget, isLightShellPath } from "@/lib/shell/lightShell";

/**
 * Keeps the light shell from outliving its page. Same-origin links to a page
 * outside the light set load as a full document, so the server renders the
 * complete shell for it. A client-side navigation that still slips through
 * (router.push from a page component) reloads once the path leaves the set.
 */
export function LightShellGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.(
        "a[href]"
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = hardNavigationTarget(anchor.href, window.location);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!isLightShellPath(pathname)) window.location.reload();
  }, [pathname]);

  return null;
}
