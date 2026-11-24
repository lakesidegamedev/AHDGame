#!/usr/bin/env node
// Stand-in for `next start -p <port> -H <host>` in cluster-server tests.
import http from "node:http";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("-p") + 1]);
const host = args[args.indexOf("-H") + 1];
const role = process.env.DISABLE_DEV_BACKGROUND === "1" ? "secondary" : "primary";

http
  .createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (req.url === "/stream") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("first;");
      setTimeout(() => res.end("second"), 50);
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": ["a=1; Path=/", "b=2; Path=/"],
      });
      res.end(JSON.stringify({ port, host, role, method: req.method, body }));
    });
  })
  .listen(port, host);
