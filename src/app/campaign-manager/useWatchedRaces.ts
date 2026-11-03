"use client";

import { useCallback, useState } from "react";

/**
 * Races the player is watching, kept in this browser per character. Storage
 * can be blocked (private windows, cleared site data), so every read and
 * write is guarded and the list still works for the visit without it.
 */

const keyFor = (characterId: string) => `ahd.campaignManager.watched.${characterId}`;

function read(characterId: string | null): Set<string> {
  if (!characterId) return new Set();
  try {
    const raw = localStorage.getItem(keyFor(characterId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []
    );
  } catch {
    return new Set();
  }
}

export function useWatchedRaces(characterId: string | null): {
  watched: ReadonlySet<string>;
  toggle: (key: string) => void;
} {
  const [state, setState] = useState(() => ({ id: characterId, watched: read(characterId) }));
  // A different character brings its own list.
  const current =
    state.id === characterId ? state : { id: characterId, watched: read(characterId) };
  if (current !== state) setState(current);

  const toggle = useCallback(
    (key: string) => {
      setState((prev) => {
        const next = new Set(prev.watched);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (characterId) {
          try {
            localStorage.setItem(keyFor(characterId), JSON.stringify([...next]));
          } catch {
            // Blocked storage: the change lasts for this visit only.
          }
        }
        return { id: characterId, watched: next };
      });
    },
    [characterId]
  );

  return { watched: current.watched, toggle };
}
