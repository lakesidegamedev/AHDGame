const TONE_CLASSES = {
  // The broadcast hero sits on the always-dark satellite backdrop, like its dek.
  onDark: "text-white/80 decoration-white/30 hover:text-white hover:decoration-white/70",
  theme:
    "text-foreground/80 decoration-foreground/30 hover:text-foreground hover:decoration-foreground/70",
} as const;

export type ExplainerLink = { href: string; label: string };

/**
 * Quiet text links under the hero copy: the era's explainer page on the
 * studio site, and the news post that announced the world. They leave
 * ahousedividedgame.com, so they open in a new tab, the same rule
 * `publicLinks.ts` applies to the drawer and footer.
 */
export function EraExplainerLink({
  links,
  tone = "theme",
}: {
  links: readonly ExplainerLink[];
  tone?: keyof typeof TONE_CLASSES;
}) {
  if (links.length === 0) return null;
  return (
    <div className="pointer-events-auto mt-4 flex flex-wrap gap-x-5 gap-y-2">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 transition-colors ${TONE_CLASSES[tone]}`}
        >
          {link.label}
          <span aria-hidden="true">→</span>
        </a>
      ))}
    </div>
  );
}
