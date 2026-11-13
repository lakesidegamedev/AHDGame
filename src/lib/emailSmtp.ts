import net from "node:net";
import { randomUUID } from "node:crypto";

/**
 * Minimal SMTP submission to a trusted relay on a private network.
 *
 * Deliberately small: plain SMTP, no TLS and no login, because the relay is a
 * send-only mail server that accepts mail only from the application's own
 * network and does the signing and the delivery to the outside world itself.
 * Do not point this at a relay across the public internet.
 */

export interface SmtpMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SmtpTarget {
  host: string;
  port: number;
  timeoutMs?: number;
}

const CRLF = "\r\n";

/** Header values must never carry a line break (header injection). */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** The bare address out of `Name <user@host>` or `user@host`. */
export function addressOf(value: string): string {
  const match = /<([^<>\s]+)>\s*$/.exec(value.trim());
  return oneLine(match ? match[1] : value).replace(/[<>\s]/g, "");
}

function encodeHeaderText(value: string): string {
  const clean = oneLine(value);
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeFrom(value: string): string {
  const match = /^(.*?)<([^<>\s]+)>\s*$/.exec(value.trim());
  if (!match || !match[1].trim()) return addressOf(value);
  const name = match[1].trim().replace(/^"|"$/g, "");
  const shown = /^[\x20-\x7e]*$/.test(name)
    ? `"${name.replace(/["\\]/g, "")}"`
    : encodeHeaderText(name);
  return `${shown} <${match[2]}>`;
}

/** Base64 in 76 character lines: safe for any text, no dot-stuffing needed. */
function base64Body(value: string): string {
  return (
    Buffer.from(value, "utf8")
      .toString("base64")
      .match(/.{1,76}/g) ?? []
  ).join(CRLF);
}

export function buildMessage(message: SmtpMessage, now = new Date()): string {
  const fromAddress = addressOf(message.from);
  const domain = fromAddress.split("@")[1] || "localhost";
  const boundary = `b-${randomUUID()}`;
  return [
    `From: ${encodeFrom(message.from)}`,
    `To: ${addressOf(message.to)}`,
    `Subject: ${encodeHeaderText(message.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(message.html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}

/** Resolves once the relay has accepted the message; rejects with its answer otherwise. */
export function sendSmtp(target: SmtpTarget, message: SmtpMessage): Promise<void> {
  const from = addressOf(message.from);
  const to = addressOf(message.to);
  if (!from.includes("@") || !to.includes("@"))
    return Promise.reject(new Error("smtp: invalid address"));

  // Each step is sent after the relay's previous answer; the last entry waits for the goodbye.
  const steps: Array<{ expect: number; send?: string }> = [
    { expect: 220, send: `EHLO ${from.split("@")[1]}` },
    { expect: 250, send: `MAIL FROM:<${from}>` },
    { expect: 250, send: `RCPT TO:<${to}>` },
    { expect: 250, send: "DATA" },
    { expect: 354, send: `${buildMessage(message)}${CRLF}.` },
    { expect: 250, send: "QUIT" },
  ];

  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: target.host, port: target.port });
    let buffer = "";
    let step = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(target.timeoutMs ?? 15_000, () => finish(new Error("smtp: timed out")));
    socket.on("error", (error) => finish(error));
    socket.on("close", () => finish(new Error("smtp: connection closed early")));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // A reply is complete at a line of the form "250 text" (a dash means more lines follow).
      for (;;) {
        const end = /^(\d{3}) [^\r\n]*\r?\n/m.exec(buffer);
        if (!end) return;
        buffer = buffer.slice(end.index + end[0].length);
        const code = Number(end[1]);
        const current = steps[step];
        if (code !== current.expect)
          return finish(new Error(`smtp: relay answered ${code} at step ${step}`));
        if (current.send === "QUIT") {
          // Accepted. Say goodbye and let the connection close on its own.
          settled = true;
          socket.end(`QUIT${CRLF}`);
          return resolve();
        }
        socket.write(`${current.send}${CRLF}`);
        step += 1;
      }
    });
  });
}
