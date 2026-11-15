export type DeviceType = "mobile" | "tablet" | "desktop" | "other";

/** Crawlers and prefetchers we skip so aggregates reflect human traffic. */
const BOT_UA_SUBSTRINGS = [
  "bot",
  "crawl",
  "spider",
  "slurp",
  "bingpreview",
  "facebookexternalhit",
  "embedly",
  "quora link preview",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "google-read-aloud",
  "ahrefs",
  "semrush",
  "mj12bot",
  "petalbot",
  "bytespider",
  "amazonbot",
  "applebot",
  "gptbot",
  "claudebot",
  "anthropic-ai",
];

export function isLikelyBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const lower = userAgent.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((s) => lower.includes(s));
}

/**
 * Best-effort device classification from the User-Agent string. We only care
 * about mobile/tablet/desktop; anything else (e.g. missing UA) becomes "other".
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "other";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|playbook/.test(ua)) return "tablet";
  if (/(android(?!.*mobi))/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|blackberry|opera mini|iemobile|windows phone/.test(ua)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edge|opera/.test(ua)) return "desktop";
  return "other";
}
