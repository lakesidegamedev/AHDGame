/** Identifies seeded default parties whose names and abbreviations are protected. */
export function DefaultPartyBadge() {
  return (
    <span
      className="inline-flex rounded-full border border-card-border px-2 py-0.5 text-xs font-medium text-muted"
      title="Seeded default party. Its name and abbreviation are protected."
    >
      Default party
    </span>
  );
}
