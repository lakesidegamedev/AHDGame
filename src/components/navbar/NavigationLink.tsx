"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";

const NEXT_ONLY_PROPS = new Set([
  "as",
  "replace",
  "scroll",
  "shallow",
  "passHref",
  "prefetch",
  "locale",
  "legacyBehavior",
  "onNavigate",
]);

/** Account-relative destinations must resolve at click time, not during prefetch. */
export default function NavigationLink(props: ComponentProps<typeof NextLink>) {
  if (props.href === "/api/corporations/mine") {
    const anchorProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !NEXT_ONLY_PROPS.has(key))
    ) as ComponentProps<"a">;
    // This redirect endpoint must bypass the client router and its prefetch cache.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    return <a {...anchorProps} href="/api/corporations/mine" />;
  }
  return <NextLink {...props} />;
}
