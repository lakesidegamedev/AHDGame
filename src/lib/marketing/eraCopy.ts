/**
 * Pure copy helpers for authored era prose. Kept apart from `marketedWorld` so
 * client code that only fills a copy slot does not pull in the registry's
 * country client config and `package.json`.
 */

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

/** Prose copy counts nations in words, not digits. "Four are open to players." */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Sentence-leading form, which is where every `{playableCount}` slot sits. */
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Fill the `{playableCount}` slot in authored era prose (`eraThemes`).
 *
 * The count always opens a sentence in that copy, so it is capitalised.
 */
export function resolveEraCopy(text: string, world: { playable: readonly unknown[] }): string {
  return text.replaceAll("{playableCount}", capitalize(countWord(world.playable.length)));
}
