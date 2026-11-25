"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { cdnStatic } from "@/lib/images/cdnUrls";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";
import { FLAVOR_CARD_PORTRAITS, type FlavorCard } from "./flavorCards";

const CARD_CLASSES =
  "relative flex-shrink-0 w-[280px] sm:w-[320px] overflow-hidden rounded-xl border border-card-border bg-card shadow-card transition-all duration-300";

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

/** A brief: the year it bites, set large where a leader's portrait would be. */
function BriefCard({ card, index }: { card: FlavorCard; index: number }) {
  return (
    <div className={CARD_CLASSES}>
      <div className="relative flex h-[180px] flex-col justify-between overflow-hidden border-b border-card-border bg-[linear-gradient(to_bottom,rgba(95,227,255,0.07),transparent_70%)] px-4 pb-3 pt-4">
        <span className="font-mono text-body-sm uppercase tracking-[0.2em] text-muted">
          {card.title}
        </span>
        <span className="font-mono text-display font-semibold leading-none tracking-tight text-foreground tabular-nums">
          {card.year}
        </span>
        <span className="self-start rounded-full border border-card-border bg-card px-2 py-0.5 text-body-sm font-medium text-muted">
          {card.country}
        </span>
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-body-sm text-red-300">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <h3 className="text-body-lg font-semibold text-foreground">{card.name}</h3>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">{card.quote}</p>
      </div>
    </div>
  );
}

function StaticCard({ card, index }: { card: FlavorCard; index: number }) {
  if (card.kind === "brief") return <BriefCard card={card} index={index} />;
  return (
    <div className={CARD_CLASSES}>
      <div className="relative h-[180px] overflow-hidden">
        {/* unoptimized: static Cloudflare CDN art — routing through the Railway image optimizer would add egress */}
        {FLAVOR_CARD_PORTRAITS.has(card.imageSlug) && (
          <Image
            src={cdnStatic("flavor-cards", card.imageSlug)}
            alt={card.name}
            fill
            sizes="320px"
            loading="lazy"
            unoptimized={bypassNextImageOptimization(cdnStatic("flavor-cards", card.imageSlug))}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="object-cover object-[center_25%]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <span className="rounded-full border border-card-border bg-card px-2 py-0.5 text-body-sm font-medium text-muted">
            {card.country}
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-body-sm text-red-300">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-body-sm text-muted">{card.year}</span>
        </div>
        <h3 className="text-body-lg font-semibold text-foreground">{card.name}</h3>
        <p className="mt-0.5 text-body-sm text-muted">{card.title}</p>
        <p className="mt-2 text-body-sm italic leading-relaxed text-muted">
          &ldquo;{card.quote}&rdquo;
        </p>
      </div>
    </div>
  );
}

export function FlavorCardCarousel({ staticCards }: { staticCards: FlavorCard[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const maxIndex = Math.max(0, staticCards.length - 1);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1));
  }, [maxIndex]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev <= 0 ? maxIndex : prev - 1));
  }, [maxIndex]);

  /* Auto-advance */
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(goNext, 5000);
    return () => clearInterval(timer);
  }, [isPaused, goNext]);

  /* Keyboard navigation */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  /* Touch swipe */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goNext();
      } else {
        goPrev();
      }
    }
    touchStartX.current = null;
  };

  /* Scroll active card within the carousel track only — never scrollIntoView,
     which would pull the whole page down to the leaders section on mobile. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      return;
    }
    const card = container.children[currentIndex] as HTMLElement | undefined;
    if (!card) return;
    const containerRect = container.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const scrollLeft =
      container.scrollLeft +
      (cardRect.left - containerRect.left) -
      containerRect.width / 2 +
      cardRect.width / 2;
    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
  }, [currentIndex]);

  if (staticCards.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Carousel track */}
      <div
        ref={containerRef}
        /* overflow-y-hidden matters: CSS promotes a `visible` axis to `auto`
           when the other axis scrolls, so an overflow-x-only track also became
           vertically scrollable and ate the page's wheel scroll. */
        className="flex gap-4 overflow-x-auto overflow-y-hidden scroll-smooth pb-4 pt-1 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {staticCards.map((card, i) => (
          <StaticCard key={card.id} card={card} index={i} />
        ))}
      </div>

      {/* Navigation arrows */}
      <button
        onClick={goPrev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 rounded-full border border-card-border bg-card p-2 text-foreground shadow-lg transition-all hover:bg-card hover:scale-105 active:scale-95"
        aria-label="Previous card"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        onClick={goNext}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 rounded-full border border-card-border bg-card p-2 text-foreground shadow-lg transition-all hover:bg-card hover:scale-105 active:scale-95"
        aria-label="Next card"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Dots */}
      <div className="mt-2 flex justify-center gap-2">
        {staticCards.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === currentIndex ? "w-6 bg-primary" : "w-2 bg-muted/40 hover:bg-muted/60"
            }`}
            aria-label={`Go to card ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
