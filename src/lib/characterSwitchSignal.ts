/**
 * Tells other open tabs that this tab switched the active character, so they
 * can offer a reload instead of acting as the old character. The session
 * itself is unchanged: this only carries a display hint.
 */
const CHANNEL = "ahd-active-character";
const STORAGE_KEY = "ahd-active-character-switch";

export interface CharacterSwitchMessage {
  characterId: string;
  name: string | null;
}

function isMessage(value: unknown): value is CharacterSwitchMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CharacterSwitchMessage).characterId === "string"
  );
}

export function announceCharacterSwitch(message: CharacterSwitchMessage): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(message);
      channel.close();
      return;
    }
    // A storage event fires in every other tab, never in the writer.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...message, at: Date.now() }));
  } catch {
    /* storage or channel unavailable: other tabs just do not get the hint */
  }
}

/** Returns an unsubscribe function. */
export function subscribeToCharacterSwitch(
  onSwitch: (message: CharacterSwitchMessage) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const cleanups: Array<() => void> = [];
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (isMessage(event.data)) onSwitch(event.data);
    };
    cleanups.push(() => channel.close());
  } else {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (isMessage(parsed)) onSwitch(parsed);
      } catch {
        /* ignore malformed payloads */
      }
    };
    window.addEventListener("storage", onStorage);
    cleanups.push(() => window.removeEventListener("storage", onStorage));
  }
  return () => cleanups.forEach((fn) => fn());
}
