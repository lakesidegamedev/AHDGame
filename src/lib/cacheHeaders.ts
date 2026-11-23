export const PRIVATE_PAGE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

/**
 * Static files served from public/, matched by extension. API routes, build
 * output and the `/cdn` proxy keep their own policies.
 */
export const STATIC_PUBLIC_ASSET_SOURCE =
  "/:path((?!api/|_next/|cdn/).*\\.(?:png|webp|avif|jpg|jpeg|svg|ico|json|woff2|ttf))";

export const STATIC_PUBLIC_ASSET_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";
