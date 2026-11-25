import { GAME_VERSION } from "@/lib/marketing/gameVersion";
import { getTrustStatus, shortVersion } from "@/lib/wiki/trustStamp";
import { WikiReportButton } from "@/components/wiki/WikiReportButton";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shows which game version a page was checked against. Renders nothing without a stamp. */
export function WikiTrustStrip({ content, slug }: { content: string; slug: string }) {
  const status = getTrustStatus(content, GAME_VERSION);
  if (!status) return null;

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-body-sm ${
        status.stale
          ? "border-warning/40 bg-warning/10 text-foreground"
          : "border-card-border bg-card/40 text-muted"
      }`}
      data-testid="wiki-trust-strip"
    >
      {status.stale ? (
        <span>
          Written for {shortVersion(status.version)}, the game is now {shortVersion(GAME_VERSION)};
          some numbers may have changed. Checked {formatDate(status.date)}.
        </span>
      ) : (
        <span>
          Checked against version {shortVersion(status.version)} on {formatDate(status.date)}.
        </span>
      )}
      {status.stale && <WikiReportButton slug={slug} label="Report a wrong number" />}
    </div>
  );
}
