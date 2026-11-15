import { spawn } from "node:child_process";
import { constants } from "node:os";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { clearCompilerCache } from "./clear-railway-build-cache.mjs";

// The persistence offset panic behind #2315. Require the Rust persistence
// source location beside the bounds failure, not just a Turbopack banner or
// an application RangeError. Unrecognized panics remain ordinary failures.
function corruptPersistence(output) {
  return /panicked at [^\n]*\bturbo-persistence[\\/]src[\\/][\w/\\.-]+\.rs:\d+(?::\d+)?:\r?\n(?:range (?:end|start) index \d+ out of range for slice of length \d+|index out of bounds: the len is \d+ but the index is \d+|offset \d+ (?:is )?out of range)/i.test(
    output
  );
}

export async function runBuild({
  cwd = process.cwd(),
  env = process.env,
  command = process.execPath,
  args = [resolve(cwd, "node_modules/next/dist/bin/next"), "build"],
  stdout = process.stdout,
  stderr = process.stderr,
  packageImage = false,
  pruneCommand = process.platform === "win32" ? "npm.cmd" : "npm",
  pruneArgs = ["prune", "--omit=dev", "--no-audit", "--no-fund"],
} = {}) {
  // BuildKit already persists .next/cache across failed build layers. Operators
  // can instead bind a host directory and set AHD_BUILD_LOG_DIR to that mount.
  const logDir = resolve(cwd, env.AHD_BUILD_LOG_DIR || ".next/cache/build-logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `build-${Date.now()}-${randomUUID()}.log`);
  const logFd = openSync(logPath, "wx", 0o600);
  let activeStage = "build";
  const output = (target, chunk) => {
    writeSync(logFd, chunk);
    target.write(chunk);
  };
  const mark = (stage, event, details = {}) => {
    if (event === "start") activeStage = stage;
    output(
      stderr,
      `\n[ahd-build] ${JSON.stringify({ time: new Date().toISOString(), stage, event, ...details })}\n`
    );
    fsyncSync(logFd);
  };
  const attempt = (stage, command, args) =>
    new Promise((done, reject) => {
      mark(stage, "start");
      const started = Date.now();
      const child = spawn(command, args, {
        cwd,
        env,
        stdio: ["inherit", "pipe", "pipe"],
        // Only the fixed npm command needs cmd.exe; never pass build flags to it.
        shell: process.platform === "win32" && command === "npm.cmd",
      });
      let tail = "",
        spawnFailed = false,
        interrupted = false,
        cancelledSignal = null;
      const forward = (signal) => {
        interrupted = true;
        cancelledSignal = signal;
        child.kill(signal);
      };
      const int = () => forward("SIGINT"),
        term = () => forward("SIGTERM");
      process.on("SIGINT", int);
      process.on("SIGTERM", term);
      const cleanup = () => {
        process.off("SIGINT", int);
        process.off("SIGTERM", term);
      };
      for (const [stream, target] of [
        [child.stdout, stdout],
        [child.stderr, stderr],
      ]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          output(target, chunk);
          tail = (tail + chunk).slice(-65536);
        });
      }
      child.once("error", (error) => {
        spawnFailed = true;
        cleanup();
        mark(stage, "spawn-error", { code: error.code });
        reject(error);
      });
      child.once("close", (code, signal) => {
        if (spawnFailed) return;
        cleanup();
        mark(stage, interrupted || signal || code !== 0 ? "failed" : "success", {
          code: interrupted ? null : code,
          signal: signal || cancelledSignal,
          durationMs: Date.now() - started,
        });
        done({
          code: interrupted ? null : code,
          signal: signal || cancelledSignal,
          interrupted,
          tail,
        });
      });
    });
  try {
    mark("build", "start", { logPath });
    let result = await attempt("compile-1", command, args);
    if (
      result.code !== 0 &&
      !result.signal &&
      !result.interrupted &&
      corruptPersistence(result.tail)
    ) {
      mark("cache-recovery", "start");
      clearCompilerCache(cwd);
      mark("cache-recovery", "success");
      result = await attempt("compile-2", command, args);
    }
    if (result.code === 0 && !result.interrupted && packageImage) {
      mark("remove-source-maps", "start");
      const removeMaps = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) removeMaps(path);
          else if (entry.isFile() && entry.name.endsWith(".map")) unlinkSync(path);
        }
      };
      removeMaps(join(cwd, ".next"));
      mark("remove-source-maps", "success");
      result = await attempt("prune-production-dependencies", pruneCommand, pruneArgs);
    }
    mark("build", result.code === 0 && !result.interrupted ? "success" : "failed", {
      code: result.code,
      signal: result.signal,
    });
    return { ...result, logPath };
  } catch (error) {
    if (activeStage !== "build") mark(activeStage, "failed", { code: error.code || "BUILD_ERROR" });
    mark("build", "failed", { code: error.code || "BUILD_ERROR" });
    throw error;
  } finally {
    fsyncSync(logFd);
    closeSync(logFd);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runBuild({
    packageImage: process.argv.includes("--production-image"),
    args: [
      resolve(process.cwd(), "node_modules/next/dist/bin/next"),
      "build",
      ...process.argv.slice(2).filter((arg) => arg !== "--production-image"),
    ],
  });
  process.exitCode = result.code ?? 128 + (constants.signals[result.signal] || 1);
}
