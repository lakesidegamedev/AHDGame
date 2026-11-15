import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/config/validatedEnv";
import type { Db } from "mongodb";
import { settingsFingerprint } from "@/lib/admin/resetRehearsal/gate";
import { runResetAndBootstrapCli } from "./resetAndBootstrapCli";

beforeEach(() => vi.stubEnv("MONGODB_DB", "fixture-world"));
afterEach(() => vi.unstubAllEnvs());

const validEnv: Env = {
  MONGODB_URI: "mongodb://127.0.0.1/fixture-world",
  MONGODB_DB: "fixture-world",
  AUTH_SECRET: "reset-cli-test-secret-long-enough",
  ADMIN_REGISTRATION_KEY: "admin-key",
  CRON_SECRET: "cron-key",
};

describe("reset and bootstrap CLI preflight", () => {
  it.each([
    ["AUTH_SECRET", false],
    ["AUTH_SECRET", true],
    ["ADMIN_REGISTRATION_KEY", false],
    ["ADMIN_REGISTRATION_KEY", true],
    ["CRON_SECRET", false],
    ["CRON_SECRET", true],
  ] as const)(
    "fails before connecting or mutating when %s is missing (check-target: %s)",
    async (missing, checkTarget) => {
      const invalidEnv = { ...validEnv, [missing]: "" };
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("MONGODB_URI", invalidEnv.MONGODB_URI);
      vi.stubEnv("MONGODB_DB", invalidEnv.MONGODB_DB!);
      vi.stubEnv("AUTH_SECRET", invalidEnv.AUTH_SECRET);
      vi.stubEnv("ADMIN_REGISTRATION_KEY", invalidEnv.ADMIN_REGISTRATION_KEY);
      vi.stubEnv("CRON_SECRET", invalidEnv.CRON_SECRET);

      const connectDb = vi.fn(async () => ({ databaseName: "fixture-world" }) as unknown as Db);
      const closeDb = vi.fn(async () => {});
      const reset = vi.fn(async () => ({}));
      const args = ["--expect-db=fixture-world", ...(checkTarget ? ["--check-target"] : [])];

      await expect(runResetAndBootstrapCli(args, { connectDb, closeDb, reset })).rejects.toThrow(
        missing
      );

      expect(connectDb).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(closeDb).not.toHaveBeenCalled();
      expect(process.env.MONGODB_DB).toBe("fixture-world");
    }
  );

  it("uses the validated application URI and checked database for a read-only target check", async () => {
    const connectDb = vi.fn(async () => ({ databaseName: "fixture-world" }) as unknown as Db);
    const closeDb = vi.fn(async () => {});
    const reset = vi.fn(async () => ({}));

    await runResetAndBootstrapCli(["--expect-db=fixture-world", "--check-target"], {
      validateEnvironment: () => validEnv,
      connectDb,
      closeDb,
      reset,
    });

    expect(connectDb).toHaveBeenCalledWith("fixture-world", validEnv.MONGODB_URI);
    expect(reset).not.toHaveBeenCalled();
    expect(closeDb).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[], true],
    [["--no-pre-iteration"], false],
  ] as const)(
    "preserves partyless 1991 founding defaults and explicit opt-out (%s)",
    async (foundingArgs, foundingExpected) => {
      const reset = vi.fn(async () => ({}));
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await runResetAndBootstrapCli(
          [
            "--expect-db=fixture-world",
            "--preset=1991-default",
            "--no-starting-parties",
            "--skip-rehearsal-gate=fixture world",
            ...foundingArgs,
          ],
          {
            validateEnvironment: () => validEnv,
            connectDb: vi.fn(async () => ({ databaseName: "fixture-world" }) as unknown as Db),
            closeDb: vi.fn(async () => {}),
            reset,
          }
        );
        expect(reset).toHaveBeenCalledWith(
          expect.objectContaining({
            preset: "1991-default",
            startingParties: "none",
            preIteration: foundingExpected ? undefined : false,
          })
        );
        const resetAnnouncement = log.mock.calls.find(([message]) =>
          String(message).startsWith("Resetting and bootstrapping")
        );
        expect(String(resetAnnouncement?.[0]).includes("pre-iteration founding")).toBe(
          foundingExpected
        );
      } finally {
        log.mockRestore();
      }
    }
  );

  it("rejects --preserve-reference for a 1991 reset before connecting", async () => {
    const connectDb = vi.fn(async () => ({ databaseName: "fixture-world" }) as unknown as Db);
    const reset = vi.fn(async () => ({}));

    await expect(
      runResetAndBootstrapCli(
        ["--expect-db=fixture-world", "--preset=1991-default", "--preserve-reference"],
        { validateEnvironment: () => validEnv, connectDb, closeDb: vi.fn(async () => {}), reset }
      )
    ).rejects.toThrow("--preserve-reference is not supported for 1991-default");

    expect(connectDb).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("rejects an incorrect explicit target before connecting", async () => {
    const connectDb = vi.fn(async () => ({ databaseName: "fixture-world" }) as unknown as Db);

    await expect(
      runResetAndBootstrapCli(["--expect-db=other-world", "--check-target"], {
        validateEnvironment: () => validEnv,
        connectDb,
        closeDb: vi.fn(async () => {}),
        reset: vi.fn(async () => ({})),
      })
    ).rejects.toThrow("mismatch");

    expect(connectDb).not.toHaveBeenCalled();
  });

  it("rejects a connected database mismatch before reset or check-target success", async () => {
    const closeDb = vi.fn(async () => {});
    const reset = vi.fn(async () => ({}));

    await expect(
      runResetAndBootstrapCli(["--expect-db=fixture-world", "--check-target"], {
        validateEnvironment: () => validEnv,
        connectDb: vi.fn(async () => ({ databaseName: "other-world" }) as unknown as Db),
        closeDb,
        reset,
      })
    ).rejects.toThrow("connected database other-world");

    expect(reset).not.toHaveBeenCalled();
    expect(closeDb).toHaveBeenCalledTimes(1);
  });
});

describe("getIteration", () => {
  it("parses an explicit label and leaves it unset when absent", async () => {
    const { getIteration } = await import("./resetAndBootstrapCli");
    expect(getIteration(["--iteration=Iteration:5"])).toEqual({ type: "Iteration", number: 5 });
    expect(getIteration(["--preset=2027-default"])).toBeUndefined();
  });

  it("rejects a malformed label", async () => {
    const { getIteration } = await import("./resetAndBootstrapCli");
    expect(() => getIteration(["--iteration=Gamma:1"])).toThrow("--iteration must look like");
    expect(() => getIteration(["--iteration=Iteration:0"])).toThrow("--iteration must look like");
  });
});

describe("rehearsal gate", () => {
  const settings = settingsFingerprint({
    preset: "2027-default",
    mode: "historical",
    startingParties: "default",
    foundingPhase: false,
  });
  const NOW = Date.parse("2026-11-12T12:00:00Z");
  const record = {
    passed: true,
    timestamp: new Date(NOW - 1000).toISOString(),
    settingsFingerprint: settings,
    treeHash: "tree-a",
  };
  const baseArgs = ["--expect-db=fixture-world", "--preset=2027-default"];

  function run(args: string[], rec: unknown = record, env: Env = validEnv) {
    const reset = vi.fn(async () => ({}));
    const connectDb = vi.fn(async (name: string) => ({ databaseName: name }) as unknown as Db);
    const promise = runResetAndBootstrapCli(args, {
      validateEnvironment: () => env,
      connectDb,
      closeDb: vi.fn(async () => {}),
      reset,
      readRecord: () => rec as never,
      treeHash: () => "tree-a",
      now: () => NOW,
    });
    return { promise, reset, connectDb };
  }

  it("refuses a real database with no record argument", async () => {
    const { promise, reset, connectDb } = run(baseArgs);
    await expect(promise).rejects.toThrow("--rehearsal-record");
    expect(connectDb).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["failed", { ...record, passed: false }],
    ["stale", { ...record, timestamp: new Date(NOW - 25 * 3600_000).toISOString() }],
    ["tree-differs", { ...record, treeHash: "tree-b" }],
    ["settings-differ", { ...record, settingsFingerprint: "{}" }],
  ])("refuses a %s record", async (reason, rec) => {
    const { promise, reset } = run([...baseArgs, "--rehearsal-record=r.json"], rec);
    await expect(promise).rejects.toThrow(reason);
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets when the record matches", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { promise, reset } = run([...baseArgs, "--rehearsal-record=r.json"]);
      await promise;
      expect(reset).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it("does not gate a rehearsal database or a target check", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      vi.stubEnv("MONGODB_DB", "rehearsal-x");
      const rehearsalEnv = {
        ...validEnv,
        MONGODB_URI: "mongodb://127.0.0.1/rehearsal-x",
        MONGODB_DB: "rehearsal-x",
      };
      const rehearsal = run(
        ["--expect-db=rehearsal-x", "--preset=2027-default"],
        null,
        rehearsalEnv
      );
      await rehearsal.promise;
      expect(rehearsal.reset).toHaveBeenCalledTimes(1);
      vi.stubEnv("MONGODB_DB", "fixture-world");
      await run([...baseArgs, "--check-target"]).promise;
    } finally {
      log.mockRestore();
    }
  });

  it("skips only with a stated reason and warns loudly", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(run([...baseArgs, "--skip-rehearsal-gate="]).promise).rejects.toThrow("reason");
      const { promise, reset } = run([...baseArgs, "--skip-rehearsal-gate=owner approved"]);
      await promise;
      expect(reset).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("owner approved");
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
