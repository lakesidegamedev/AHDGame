import { wikiHelpHref, type WikiHelpScreen } from "@/lib/wiki/helpLinks";

interface WikiHelpLinkProps {
  screen: WikiHelpScreen;
  className?: string;
}

/** Small "?" that opens the wiki article for the current screen in a new tab. */
export function WikiHelpLink({ screen, className = "" }: WikiHelpLinkProps) {
  return (
    <a
      href={wikiHelpHref(screen)}
      target="_blank"
      rel="noopener"
      aria-label="How this works"
      title="How this works"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-card-border text-body-sm font-semibold text-muted transition-colors hover:border-primary/50 hover:text-primary ${className}`}
    >
      ?
    </a>
  );
}
