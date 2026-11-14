const EASTERN = "America/New_York";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** `01d 23:10:05`, or dashes before the first client tick. */
export function formatRemaining(
  parts: { days: number; hours: number; minutes: number; seconds: number } | null
): string {
  if (!parts) return "--d --:--:--";
  return `${pad(parts.days)}d ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

/**
 * The time in Eastern for the reader's locale. Server and browser ICU differ
 * in the spaces they emit (a narrow no-break space before "PM" in newer
 * builds), so every space is normalized.
 */
export function formatEastern(at: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EASTERN,
  })
    .format(new Date(at))
    .replace(/\s/g, " ");
}
