#!/usr/bin/env node
/**
 * Runs AHD_WEB_PROCESSES Next.js servers behind a small router, because one
 * `next start` renders on a single thread and uses about one core.
 *
 * Reads go to the ready server with the fewest requests in flight. Writes go
 * to server 0: per-corporation money locks and the user cache are in-process.
 * Only server 0 runs hosted boot work; the rest get DISABLE_DEV_BACKGROUND=1.
 * Exited servers restart with backoff. Unset or 1 runs a plain `next start`.
 */
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
];

const MAX_PROCESSES = 16;
const READY_POLL_MS = 1_000;
const MAX_RESTART_DELAY_MS = 30_000;
const SHUTDOWN_GRACE_MS = 25_000;

/** Parses AHD_WEB_PROCESSES; anything missing or out of range means one server. */
export function parseProcessCount(raw) {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PROCESSES ? n : 1;
}

/** Loopback port for server `index`, kept clear of the public port. */
export function childPort(publicPort, index) {
  return publicPort + 100 + index;
}

/** Environment for server `index`; only server 0 owns the hosted boot work. */
export function childEnv(baseEnv, index, port) {
  const env = { ...baseEnv, PORT: String(port), HOSTNAME: "127.0.0.1" };
  if (index > 0) env.DISABLE_DEV_BACKGROUND = "1";
  return env;
}

/**
 * Chooses the server for a request: writes always go to server 0, reads to
 * the ready server with the fewest requests in flight. Null when none fits.
 */
export function pickChild(method, children) {
  if (!READ_METHODS.has((method ?? "GET").toUpperCase())) {
    const primary = children[0];
    return primary?.ready ? primary : null;
  }
  let best = null;
  for (const child of children) {
    if (!child.ready) continue;
    if (!best || child.inFlight < best.inFlight) best = child;
  }
  return best;
}

/** Request or response headers without the hop-by-hop ones a proxy must drop. */
export function forwardHeaders(headers) {
  const out = { ...headers };
  for (const name of HOP_BY_HOP) delete out[name];
  return out;
}

/** Backoff before restarting a server that has exited `failures` times in a row. */
export function restartDelayMs(failures) {
  return Math.min(MAX_RESTART_DELAY_MS, 1_000 * 2 ** Math.max(0, failures - 1));
}

function log(message) {
  console.log(`[web-cluster] ${message}`);
}

function probeHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/health", timeout: 2_000 },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
  });
}

function runSingle(nextBin) {
  const child = spawn(nextBin, ["start"], { stdio: "inherit", env: process.env });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

function runCluster(count, nextBin) {
  const publicPort = Number.parseInt(process.env.PORT ?? "3000", 10);
  const publicHost = process.env.HOSTNAME || "0.0.0.0";
  let shuttingDown = false;

  const children = Array.from({ length: count }, (_, index) => ({
    index,
    port: childPort(publicPort, index),
    ready: false,
    inFlight: 0,
    failures: 0,
    process: null,
    agent: new http.Agent({ keepAlive: true, maxSockets: 256 }),
  }));

  async function waitUntilReady(child, proc) {
    while (!shuttingDown && child.process === proc && proc.exitCode === null) {
      if (await probeHealth(child.port)) {
        child.ready = true;
        child.failures = 0;
        log(`server ${child.index} ready on 127.0.0.1:${child.port}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }

  function start(child) {
    const proc = spawn(nextBin, ["start", "-p", String(child.port), "-H", "127.0.0.1"], {
      stdio: "inherit",
      env: childEnv(process.env, child.index, child.port),
    });
    child.process = proc;
    child.ready = false;
    log(`server ${child.index} starting (pid ${proc.pid})`);
    proc.on("exit", (code, signal) => {
      child.ready = false;
      if (child.process !== proc) return;
      child.process = null;
      if (shuttingDown) return;
      child.failures += 1;
      const delay = restartDelayMs(child.failures);
      log(
        `server ${child.index} exited (code ${code}, signal ${signal}); restarting in ${delay}ms`
      );
      setTimeout(() => {
        if (!shuttingDown) start(child);
      }, delay);
    });
    void waitUntilReady(child, proc);
  }

  const server = http.createServer((req, res) => {
    const child = pickChild(req.method, children);
    if (!child) {
      res.writeHead(503, { "content-type": "text/plain", "retry-after": "2" });
      res.end("Starting up, try again in a moment.");
      return;
    }
    child.inFlight += 1;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      child.inFlight -= 1;
    };

    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: child.port,
        method: req.method,
        path: req.url,
        headers: forwardHeaders(req.headers),
        agent: child.agent,
      },
      (upstreamRes) => {
        res.writeHead(
          upstreamRes.statusCode ?? 502,
          upstreamRes.statusMessage,
          forwardHeaders(upstreamRes.headers)
        );
        upstreamRes.pipe(res);
        upstreamRes.on("error", () => res.destroy());
      }
    );
    upstream.on("error", (err) => {
      if (err && err.code === "ECONNREFUSED") child.ready = false;
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("Bad gateway");
      } else {
        res.destroy();
      }
      settle();
    });
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
      settle();
    });
    req.pipe(upstream);
  });

  // Upgrades are rare here; send them to server 0 as a raw tunnel.
  server.on("upgrade", (req, socket, head) => {
    const child = pickChild("POST", children);
    if (!child) {
      socket.destroy();
      return;
    }
    const upstream = net.connect(child.port, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  // Long-lived streams (event streams, streamed pages) must not be cut off.
  server.requestTimeout = 0;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  for (const child of children) start(child);
  server.listen(publicPort, publicHost, () => {
    log(`routing ${publicHost}:${publicPort} to ${count} servers`);
  });

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal}: stopping ${count} servers`);
    server.close();
    const running = children.map((child) => child.process).filter(Boolean);
    for (const proc of running) proc.kill("SIGTERM");
    const deadline = setTimeout(() => {
      for (const proc of running) if (proc.exitCode === null) proc.kill("SIGKILL");
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    deadline.unref();
    Promise.all(
      running.map((proc) =>
        proc.exitCode !== null ? null : new Promise((resolve) => proc.on("exit", resolve))
      )
    ).then(() => process.exit(0));
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function main() {
  const nextBin = process.env.AHD_NEXT_BIN || "node_modules/.bin/next";
  const count = parseProcessCount(process.env.AHD_WEB_PROCESSES);
  if (count === 1) runSingle(nextBin);
  else runCluster(count, nextBin);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
