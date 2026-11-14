import { servicesConfig } from "@/lib/config/services";
import { sendSmtp } from "@/lib/emailSmtp";

/**
 * Transactional email.
 *
 * Two routes, no SDK dependency for either:
 *  - SMTP_HOST set: hand the message to that mail relay (see emailSmtp.ts).
 *  - otherwise RESEND_API_KEY set: a single fetch to the Resend HTTP API.
 * Degrades to a "not configured" no-op when EMAIL_FROM or both routes are unset,
 * matching how Turnstile and the OAuth providers degrade elsewhere in this
 * codebase, so local dev works without email credentials.
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  { sent: true; id?: string } | { sent: false; reason: "email-not-configured" | "send-failed" };

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = servicesConfig.resendApiKey();
  const from = servicesConfig.emailFrom();
  const smtpHost = servicesConfig.smtpHost();
  if (!from || (!apiKey && !smtpHost)) {
    return { sent: false, reason: "email-not-configured" };
  }

  try {
    if (smtpHost) {
      await sendSmtp(
        { host: smtpHost, port: servicesConfig.smtpPort() },
        { from, to, subject, html, text }
      );
      return { sent: true };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error(`sendEmail: Resend responded ${res.status}`);
      return { sent: false, reason: "send-failed" };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (error) {
    console.error("sendEmail: request or mail relay failed", error);
    return { sent: false, reason: "send-failed" };
  }
}
