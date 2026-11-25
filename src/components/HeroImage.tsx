"use client";

import { useState } from "react";
import Image from "next/image";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";

interface HeroImageProps {
  src: string;
  /** Pre-sized phone variant of a pre-sized desktop source. */
  mobileSrc?: string;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fetchPriority?: React.ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
  style?: React.CSSProperties;
  optimize?: boolean;
}

/**
 * Hero image with gradient fallback when the image fails to load.
 * Uses next/image for automatic optimization (WebP, resizing).
 */
export function HeroImage({
  src,
  mobileSrc,
  alt,
  fill = true,
  className = "",
  sizes = "100vw",
  priority,
  fetchPriority,
  style,
  optimize = false,
}: HeroImageProps) {
  const [errored, setErrored] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);

  if (errored) {
    return (
      <div
        className={`absolute inset-0 bg-gradient-to-br from-card via-card-elevated to-card-border ${className}`}
        aria-hidden
      />
    );
  }

  const image = (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      priority={priority && !mobileSrc}
      loading={priority && mobileSrc ? "eager" : undefined}
      fetchPriority={fetchPriority}
      sizes={sizes}
      className={fill ? `object-cover ${className}` : className}
      style={fill ? { objectPosition: "center", ...style } : style}
      onError={() => {
        if (optimize && !mobileSrc && !useOriginal) setUseOriginal(true);
        else setErrored(true);
      }}
      unoptimized={
        Boolean(mobileSrc) || (optimize ? useOriginal : bypassNextImageOptimization(src))
      }
    />
  );
  if (!mobileSrc) return image;

  const phone = "(width < 640px)";
  return (
    <>
      {priority && (
        <>
          <link rel="preload" as="image" href={mobileSrc} media={phone} fetchPriority="high" />
          <link rel="preload" as="image" href={src} media="(width >= 640px)" fetchPriority="high" />
        </>
      )}
      <picture>
        <source media={phone} srcSet={mobileSrc} />
        {image}
      </picture>
    </>
  );
}
