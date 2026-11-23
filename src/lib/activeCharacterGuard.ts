/**
 * Tracks whether the account's active character changed after this page was
 * rendered. The active character is account-wide, so a switch made in another
 * browser or device changes what the server acts as while this page still shows
 * the old character. The page remembers the character it first rendered for and
 * compares every later server answer against it.
 */
export interface ActiveCharacterMismatch {
  characterId: string;
  name: string | null;
}

type Listener = () => void;

let renderedCharacterId: string | null = null;
let mismatch: ActiveCharacterMismatch | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

/** First call fixes the character this page belongs to; later calls are ignored. */
export function noteRenderedCharacter(characterId: string | null | undefined): void {
  if (renderedCharacterId || !characterId) return;
  renderedCharacterId = characterId;
}

/** Feed the active character from any periodic server response. */
export function noteServerCharacter(
  characterId: string | null | undefined,
  name: string | null | undefined
): void {
  if (!renderedCharacterId || !characterId) return;
  if (characterId === renderedCharacterId) {
    if (mismatch) {
      mismatch = null;
      emit();
    }
    return;
  }
  if (mismatch?.characterId === characterId) return;
  mismatch = { characterId, name: name ?? null };
  emit();
}

/** A same-browser tab told us the character changed. */
export function noteCharacterSwitchSignal(message: ActiveCharacterMismatch): void {
  if (renderedCharacterId && message.characterId === renderedCharacterId) return;
  mismatch = message;
  emit();
}

export function getActiveCharacterMismatch(): ActiveCharacterMismatch | null {
  return mismatch;
}

export function subscribeActiveCharacterMismatch(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function resetActiveCharacterGuardForTests(): void {
  renderedCharacterId = null;
  mismatch = null;
  listeners.clear();
}
