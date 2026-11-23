import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  childEnv,
  childPort,
  forwardHeaders,
  parseProcessCount,
  pickChild,
  restartDelayMs,
} from "./cluster-server.mjs";

type Child = { index: number; ready: boolean; inFlight: number };

describe("parseProcessCount", () => {
  it("defaults to a single server", () => {
    expect(parseProcessCount(undefined)).toBe(1);
    expect(parseProcessCount("")).toBe(1);
    expect(parseProcessCount("zero")).toBe(1);
    expect(parseProcessCount("0")).toBe(1);
    expect(parseProcessCount("99")).toBe(1);
  });

  it("accepts a sensible count", () => {
    expect(parseProcessCount("4")).toBe(4);
  });
});

describe("childEnv", () => {
  it("lets only server 0 run the hosted boot work", () => {
    const base = { PORT: "3000", HOSTNAME: "0.0.0.0", CRON_OWNER: "worker" };
    const primary = childEnv(base, 0, childPort(3000, 0));
    const secondary = childEnv(base, 2, childPort(3000, 2));
    expect(primary.DISABLE_DEV_BACKGROUND).toBeUndefined();
    expect(secondary.DISABLE_DEV_BACKGROUND).toBe("1");
    expect(primary).toMatchObject({ PORT: "3100", HOSTNAME: "127.0.0.1", CRON_OWNER: "worker" });
    expect(secondary.PORT).toBe("3102");
  });
});

describe("pickChild", () => {
  const children = (): Child[] => [
    { index: 0, ready: true, inFlight: 5 },
    { index: 1, ready: true, inFlight: 1 },
    { index: 2, ready: false, inFlight: 0 },
  ];

  it("sends every write to server 0", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(pickChild(method, children())?.index).toBe(0);
    }
  });

  it("sends reads to the least busy ready server", () => {
    expect(pickChild("GET", children())?.index).toBe(1);
    expect(pickChild("HEAD", children())?.index).toBe(1);
  });

  it("refuses writes while server 0 is down rather than misrouting them", () => {
    const list = children();
    list[0].ready = false;
    expect(pickChild("POST", list)).toBeNull();
    expect(pickChild("GET", list)?.index).toBe(1);
  });
});

describe("forwardHeaders", () => {
  it("drops hop-by-hop headers and keeps the rest", () => {
    expect(
      forwardHeaders({
        connection: "keep-alive",
        "transfer-encoding": "chunked",
        host: "example.test",
        cookie: "x=1",
      })
    ).toEqual({ host: "example.test", cookie: "x=1" });
  });
});

describe("restartDelayMs", () => {
  it("backs off and caps", () => {
    expect(restartDelayMs(1)).toBe(1_000);
    expect(restartDelayMs(3)).toBe(4_000);
    expect(restartDelayMs(20)).toBe(30_000);
  });
});

describe("cluster-server end to end", () => {
  const port = 41_000 + Math.floor(Math.random() * 500);
  let proc: ChildProcess;

  beforeAll(async () => {
    proc = spawn(process.execPath, [path.join(__dirname, "cluster-server.mjs")], {
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        AHD_WEB_PROCESSES: "2",
        AHD_NEXT_BIN: path.join(__dirname, "__fixtures__", "fake-next.mjs"),
      },
      stdio: "ignore",
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const statuses = await Promise.all(
        [0, 1].map((i) =>
          fetch(`http://127.0.0.1:${childPort(port, i)}/api/health`)
            .then((r) => r.status)
            .catch(() => 0)
        )
      );
      const routed = await fetch(`http://127.0.0.1:${port}/api/health`)
        .then((r) => r.status)
        .catch(() => 0);
      if (statuses.every((s) => s === 200) && routed === 200) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Let the router's own readiness poll see both servers.
    await new Promise((r) => setTimeout(r, 1_500));
  }, 30_000);

  afterAll(() => {
    proc?.kill("SIGTERM");
  });

  it("sends writes to the primary server with their body intact", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`http://127.0.0.1:${port}/api/thing`, {
        method: "POST",
        body: "payload",
      });
      const json = await res.json();
      expect(json).toMatchObject({ role: "primary", method: "POST", body: "payload" });
    }
  });

  it("spreads concurrent reads across servers", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => fetch(`http://127.0.0.1:${port}/page`).then((r) => r.json()))
    );
    expect(new Set(results.map((r) => r.role))).toEqual(new Set(["primary", "secondary"]));
  });

  it("keeps multiple cookies and streamed bodies", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/page`);
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    const streamed = await fetch(`http://127.0.0.1:${port}/stream`).then((r) => r.text());
    expect(streamed).toBe("first;second");
  });
});
