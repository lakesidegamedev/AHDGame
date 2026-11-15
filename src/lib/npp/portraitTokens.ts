/**
 * Opaque public ids for the NPP portrait pool.
 *
 * The pool (`src/data/npp-politician-images.json`) is a set of generic faces
 * for fictional politicians. Its internal ids are name slugs of the people in
 * the photographs, so exposing one in an avatar URL would tell a player who
 * the face "really" is. New avatars therefore carry an opaque token derived
 * from the pool id, and the image route resolves either form.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/** Prefix that marks an opaque portrait token in an avatar path. */
export const PORTRAIT_TOKEN_PREFIX = "p-";

/** Stable opaque token for one pool id. */
export function portraitToken(poolId: string): string {
  return `${PORTRAIT_TOKEN_PREFIX}${createHash("sha256").update(poolId).digest("hex").slice(0, 16)}`;
}

/** Avatar route path for one pool id, using its opaque token. */
export function portraitAvatarPath(poolId: string): string {
  return `/api/images/npp-politicians/${portraitToken(poolId)}`;
}

interface PoolEntry {
  id: string;
  url: string;
}

let sourceCache: Map<string, string> | null = null;

/**
 * Upstream image URL for a token or a legacy pool id. Legacy ids stay
 * resolvable so avatars stored by earlier worlds keep loading.
 */
export function resolvePortraitSource(idOrToken: string): string | undefined {
  if (!sourceCache) {
    sourceCache = new Map();
    try {
      const filePath = path.join(process.cwd(), "src", "data", "npp-politician-images.json");
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as PoolEntry[];
      for (const entry of data) {
        if (!entry.url) continue;
        sourceCache.set(entry.id, entry.url);
        sourceCache.set(portraitToken(entry.id), entry.url);
      }
    } catch {
      // Missing or unreadable pool: every lookup 404s.
    }
  }
  return sourceCache.get(idOrToken);
}
