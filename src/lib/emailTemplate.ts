export const EMAIL_DEFAULT_BASE_URL = "https://ahousedividedgame.com";

const NAVY = "#0f1b2d";
const INK = "#1a2433";
const MUTED = "#5b6676";
const FONT = "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const FOOTER_TEXT =
  "Lakeside Games. You are receiving this because of an action on your A House Divided account.";
const STUDIO_URL = "https://lakesidegames.net";

export interface BrandedEmailInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
  /** Public site origin used for the logo image. */
  baseUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  if (!/^(https:\/\/|http:\/\/localhost)/.test(url) || /[\s<>"'\\]/.test(url)) {
    throw new Error(
      "Email URL must be https:// or http://localhost and contain no unsafe characters"
    );
  }
  return escapeHtml(url);
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const base = (input.baseUrl ?? EMAIL_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const logo = safeUrl(`${base}/ahd-logo.png`);
  const ctaUrl = input.cta ? safeUrl(input.cta.url) : null;
  const studio = safeUrl(STUDIO_URL);

  const p = (s: string) =>
    `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:${INK};">${escapeHtml(s)}</p>`;

  const button =
    input.cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;"><tr>` +
        `<td align="center" bgcolor="#e8b04a" style="background-color:#e8b04a;border-radius:6px;">` +
        `<a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:20px;color:#1a1407;text-decoration:none;border-radius:6px;">${escapeHtml(input.cta.label)}</a>` +
        `</td></tr></table>` +
        `<p style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${MUTED};word-break:break-all;">Or open this link: <a href="${ctaUrl}" style="color:${INK};">${ctaUrl}</a></p>`
      : "";

  const note = input.footnote
    ? `<p style="margin:0;font-size:14px;line-height:21px;color:${MUTED};">${escapeHtml(input.footnote)}</p>`
    : "";

  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(input.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#eef1f5;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(input.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f5" style="background-color:#eef1f5;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;font-family:${FONT};">` +
    `<tr><td bgcolor="${NAVY}" style="background-color:${NAVY};padding:16px 24px;border-radius:8px 8px 0 0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;"><img src="${logo}" alt="A House Divided" width="36" height="36" style="display:block;border:0;height:36px;width:36px;"></td>` +
    `<td style="vertical-align:middle;padding-left:12px;font-family:${FONT};font-size:18px;font-weight:bold;color:#ffffff;">A House Divided</td>` +
    `</tr></table></td></tr>` +
    `<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:28px 24px;font-family:${FONT};color:${INK};">` +
    `<h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;font-weight:bold;color:${INK};">${escapeHtml(input.heading)}</h1>` +
    input.paragraphs.map(p).join("") +
    button +
    note +
    `</td></tr>` +
    `<tr><td style="padding:16px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(FOOTER_TEXT)} ` +
    `<a href="${studio}" style="color:${MUTED};">lakesidegames.net</a></td></tr>` +
    `</table></td></tr></table></body></html>`;

  const textParts = [input.heading, ...input.paragraphs];
  if (input.cta) textParts.push(`${input.cta.label}: ${input.cta.url}`);
  if (input.footnote) textParts.push(input.footnote);
  textParts.push(`${FOOTER_TEXT}\n${STUDIO_URL}`);
  const text = textParts.join("\n\n");

  return { html, text };
}
