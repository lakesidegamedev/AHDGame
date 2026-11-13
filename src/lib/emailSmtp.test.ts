import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { addressOf, buildMessage, sendSmtp } from "./emailSmtp";

const servers: net.Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A relay that records the dialogue. `refuseAt` makes it answer 550 to that command. */
async function fakeRelay(refuseAt?: string) {
  const lines: string[] = [];
  let data = "";
  const server = net.createServer((socket) => {
    let inData = false;
    let pending = "";
    socket.write("220-relay ready\r\n220 go\r\n");
    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = pending.indexOf("\r\n.\r\n");
          if (end < 0) return;
          data = pending.slice(0, end);
          pending = pending.slice(end + 5);
          inData = false;
          socket.write("250 queued\r\n");
          continue;
        }
        const eol = pending.indexOf("\r\n");
        if (eol < 0) return;
        const line = pending.slice(0, eol);
        pending = pending.slice(eol + 2);
        lines.push(line);
        const verb = line.split(/[ :]/)[0];
        if (refuseAt && verb === refuseAt) socket.write("550 no\r\n");
        else if (verb === "EHLO") socket.write("250-relay\r\n250 SIZE 2097152\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (verb === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, lines, data: () => data };
}

const message = {
  from: "A House Divided <noreply@example.com>",
  to: "player@example.org",
  subject: "Réinitialisation",
  html: "<p>Hello.</p>\r\n.\r\n<p>still the body</p>",
  text: "Hello.\n.\nstill the body",
};

describe("sendSmtp", () => {
  it("hands the message to the relay with bare envelope addresses", async () => {
    const relay = await fakeRelay();
    await sendSmtp({ host: "127.0.0.1", port: relay.port }, message);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(relay.lines).toEqual([
      "EHLO example.com",
      "MAIL FROM:<noreply@example.com>",
      "RCPT TO:<player@example.org>",
      "DATA",
      "QUIT",
    ]);
    const body = relay.data();
    expect(body).toContain('From: "A House Divided" <noreply@example.com>');
    expect(body).toContain("Subject: =?UTF-8?B?");
    // A lone dot inside the content must not end the message early.
    expect(body).toContain(Buffer.from(message.text, "utf8").toString("base64"));
  });

  it("rejects when the relay refuses the recipient", async () => {
    const relay = await fakeRelay("RCPT");
    await expect(sendSmtp({ host: "127.0.0.1", port: relay.port }, message)).rejects.toThrow(/550/);
  });

  it("rejects when nothing is listening", async () => {
    const relay = await fakeRelay();
    const port = relay.port;
    servers.splice(0).forEach((server) => server.close());
    await expect(sendSmtp({ host: "127.0.0.1", port, timeoutMs: 2000 }, message)).rejects.toThrow();
  });
});

describe("message building", () => {
  it("never lets a line break into a header or an address", () => {
    const built = buildMessage({
      ...message,
      subject: "Hi\r\nBcc: evil@example.net",
      to: "a@b.c\r\nRCPT TO:<x@y.z>",
    });
    const headers = built.split("\r\n\r\n")[0];
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers.split("\r\n").filter((line) => line.startsWith("To:"))).toHaveLength(1);
    expect(addressOf("Name <user@host.tld>")).toBe("user@host.tld");
    expect(addressOf("a@b.c\r\nRCPT TO:<x@y.z>")).not.toMatch(/[\r\n<> ]/);
  });
});
