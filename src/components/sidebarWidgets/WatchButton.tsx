"use client";

import { useTranslations } from "next-intl";
import { PixelNavIcon } from "@/components/navbar/PixelNavIcon";
import type { WatchItem, WatchKind } from "@/lib/sidebarWidgets/watchlist";
import { useWatchlist, useWatchlistEnabled } from "./useWatchlist";

type Tone = "card" | "image";

interface WatchButtonProps {
  kind: WatchKind;
  id: string | number | null | undefined;
  /** `image` sits on a dark hero picture. */
  tone?: Tone;
}

const TONES: Record<Tone, { on: string; off: string; size: string }> = {
  card: {
    on: "border-primary/50 bg-primary/15 text-primary",
    off: "border-card-border bg-card text-fg-2 hover:text-foreground",
    size: "h-10 px-3 text-sm",
  },
  image: {
    on: "border-white/40 bg-white/20 text-white",
    off: "border-white/10 bg-black/50 text-white/80 hover:text-white",
    size: "h-8 px-2.5 text-xs",
  },
};

function WatchToggle({ item, tone }: { item: WatchItem; tone: Tone }) {
  const t = useTranslations("nav.widgets.watchlist");
  const watchlist = useWatchlist();
  const watched = watchlist.isWatched(item);
  const label = watched ? t("unwatch") : t("watch");
  const style = TONES[tone];
  return (
    <button
      type="button"
      onClick={() => watchlist.toggle(item)}
      aria-pressed={watched}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${style.size} ${watched ? style.on : style.off}`}
    >
      <PixelNavIcon name="star" className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

/** Star a corporation or commodity for the watchlist widget. Experimental only. */
export function WatchButton({ kind, id, tone = "card" }: WatchButtonProps) {
  const enabled = useWatchlistEnabled();
  if (!enabled || id === null || id === undefined) return null;
  return <WatchToggle item={{ kind, id: String(id) }} tone={tone} />;
}
