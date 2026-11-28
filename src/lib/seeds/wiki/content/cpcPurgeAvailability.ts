/** Retain legacy documentation without presenting a disabled action as available. */
export function correctCpcPurgeAvailability(content: string): string {
  return content
    .replace(
      "4. Avoid purges. Purges reduce confidence. Severe purges can trigger internal crises.",
      "4. Party purges are currently disabled. Focus on policy alignment and mandate renewal."
    )
    .replace(
      "Near-total control. Purges possible with minimal backlash.",
      "Near-total internal control. Party purges remain disabled."
    )
    .replace(
      "### Purges\n\nPurges are internal CPC disciplinary actions. They remove disloyal officials but cost confidence:",
      "### Party purges (disabled)\n\nParty purges are currently disabled. The costs below document the legacy mechanic, not an available player action:"
    )
    .replace(
      "- Time purges carefully. Never purge when confidence is already below 60.\n- Process purges quickly. The -2/turn backlog compounds fast.",
      "- Party purges are currently disabled; there is no purge action to time or process."
    );
}
