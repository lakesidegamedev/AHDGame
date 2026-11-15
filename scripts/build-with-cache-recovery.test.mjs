import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild } from "./build-with-cache-recovery.mjs";
import { clearCompilerCache } from "./clear-railway-build-cache.mjs";

const panic =
  "thread 'worker' panicked at turbopack/crates/turbo-persistence/src/static_sorted_file.rs:145:17:\nrange end index 123 out of range for slice of length 100";
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "compiler-cache-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const kind of ["turbopack", "webpack", "fetch-cache"]) {
    mkdirSync(join(cwd, ".next/cache", kind), { recursive: true });
    writeFileSync(join(cwd, ".next/cache", kind, "marker"), "keep");
  }
  writeFileSync(
    join(cwd, "fake-build.cjs"),
    `
    const fs = require('node:fs');
    let n = Number(fs.existsSync('attempts') ? fs.readFileSync('attempts', 'utf8') : 0) + 1;
    fs.writeFileSync('attempts', String(n));
    if (process.env.FAIL === 'always' || (process.env.FAIL === 'first' && n === 1)) {
      process.stderr.write(process.env.DIAGNOSTIC);
      process.exit(7);
    }
    process.stdout.write('build complete');
  `
  );
  const invoke = (env = {}, options = {}) =>
    runBuild({
      cwd,
      env: { ...process.env, RAILWAY_ENVIRONMENT_NAME: "test", ...env },
      args: [join(cwd, "fake-build.cjs")],
      stdout: { write() {} },
      stderr: { write() {} },
      ...options,
    });
  return {
    cwd,
    invoke,
    attempts: () => Number(readFileSync(join(cwd, "attempts"), "utf8")),
    marker: (kind) => existsSync(join(cwd, ".next/cache", kind, "marker")),
  };
}
test("successful Railway builds retain compiler and fetch caches", async (t) => {
  const h = fixture(t);
  assert.equal((await h.invoke()).code, 0);
  assert.equal(h.attempts(), 1);
  for (const kind of ["turbopack", "webpack", "fetch-cache"]) assert.equal(h.marker(kind), true);
});
test("verified persistence bounds panic gets one clean retry without touching fetch cache or mount points", async (t) => {
  const h = fixture(t);
  assert.equal((await h.invoke({ FAIL: "first", DIAGNOSTIC: panic })).code, 0);
  assert.equal(h.attempts(), 2);
  for (const kind of ["turbopack", "webpack"]) {
    assert.equal(h.marker(kind), false);
    assert.equal(existsSync(join(h.cwd, ".next/cache", kind)), true);
  }
  assert.equal(h.marker("fetch-cache"), true);
});
for (const diagnostic of [
  "Type error: incompatible assignment",
  "Turbopack panicked: unsupported module",
  "RangeError: Offset is outside the bounds of the DataView",
  "turbo-persistence: permission denied",
]) {
  test(`ordinary failure is not retried: ${diagnostic}`, async (t) => {
    const h = fixture(t);
    assert.equal((await h.invoke({ FAIL: "always", DIAGNOSTIC: diagnostic })).code, 7);
    assert.equal(h.attempts(), 1);
    assert.equal(h.marker("turbopack"), true);
  });
}
test("the second build failure stays failed and cannot trigger another retry", async (t) => {
  const h = fixture(t);
  assert.equal((await h.invoke({ FAIL: "always", DIAGNOSTIC: panic })).code, 7);
  assert.equal(h.attempts(), 2);
});
test("automatic recovery works on self-hosted builds without Railway variables", async (t) => {
  const h = fixture(t);
  assert.equal(
    (await h.invoke({ FAIL: "first", DIAGNOSTIC: panic, RAILWAY_ENVIRONMENT_NAME: "" })).code,
    0
  );
  assert.equal(h.attempts(), 2);
  assert.equal(h.marker("turbopack"), false);
});
test("explicit recovery clears compiler contents only", (t) => {
  const h = fixture(t);
  clearCompilerCache(h.cwd);
  assert.equal(h.marker("turbopack"), false);
  assert.equal(h.marker("webpack"), false);
  assert.equal(h.marker("fetch-cache"), true);
});

test(
  "a signalled compiler is not retried even with a persistence diagnostic",
  { skip: process.platform === "win32" },
  async (t) => {
    const h = fixture(t);
    writeFileSync(
      join(h.cwd, "fake-build.cjs"),
      `process.stderr.write(${JSON.stringify(panic)}); process.kill(process.pid, 'SIGTERM');`
    );
    assert.equal((await h.invoke()).signal, "SIGTERM");
    assert.equal(h.marker("turbopack"), true);
  }
);

test("missing compiler process fails without clearing cache", async (t) => {
  const h = fixture(t);
  await assert.rejects(
    runBuild({ cwd: h.cwd, command: join(h.cwd, "missing-command"), args: [] }),
    /ENOENT/
  );
  assert.equal(h.marker("turbopack"), true);
});

test("explicit recovery refuses symlinked compiler directories", async (t) => {
  const h = fixture(t);
  const { symlinkSync } = await import("node:fs");
  const outside = join(h.cwd, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "marker"), "keep");
  rmSync(join(h.cwd, ".next/cache/turbopack"), { recursive: true });
  symlinkSync(
    outside,
    join(h.cwd, ".next/cache/turbopack"),
    process.platform === "win32" ? "junction" : "dir"
  );
  assert.throws(() => clearCompilerCache(h.cwd), /Not a compiler-cache directory/);
  assert.equal(existsSync(join(outside, "marker")), true);
});

for (const fail of ["never", "first", "always"]) {
  test(`npm build keeps postbuild after successful compilation only (${fail})`, async (t) => {
    const h = fixture(t);
    const { copyFileSync } = await import("node:fs");
    const { spawnSync } = await import("node:child_process");
    const project = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    writeFileSync(join(h.cwd, "package.json"), JSON.stringify({ scripts: project.scripts }));
    mkdirSync(join(h.cwd, "scripts"));
    for (const file of ["build-with-cache-recovery.mjs", "clear-railway-build-cache.mjs"]) {
      copyFileSync(new URL(file, import.meta.url), join(h.cwd, "scripts", file));
    }
    mkdirSync(join(h.cwd, "node_modules/next/dist/bin"), { recursive: true });
    copyFileSync(join(h.cwd, "fake-build.cjs"), join(h.cwd, "node_modules/next/dist/bin/next"));
    mkdirSync(join(h.cwd, "node_modules/.bin"), { recursive: true });
    writeFileSync(
      join(h.cwd, "node_modules/.bin/tsx"),
      "#!/usr/bin/env node\nrequire('node:fs').writeFileSync('postbuilt','yes');",
      { mode: 0o755 }
    );
    if (process.platform === "win32") {
      writeFileSync(
        join(h.cwd, "node_modules/.bin/tsx.cmd"),
        "@node -e \"require('node:fs').writeFileSync('postbuilt','yes')\""
      );
    }
    const result = spawnSync("npm", ["run", "build"], {
      cwd: h.cwd,
      env: { ...process.env, RAILWAY_ENVIRONMENT_NAME: "test", FAIL: fail, DIAGNOSTIC: panic },
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    assert.equal(result.status, fail === "always" ? 7 : 0, result.stderr);
    assert.equal(h.attempts(), fail === "never" ? 1 : 2);
    assert.equal(h.marker("turbopack"), fail === "never");
    assert.equal(existsSync(join(h.cwd, "postbuilt")), fail !== "always");
    assert.equal(h.marker("fetch-cache"), true);
  });
}

test("cancelling the wrapper stays failed even when the compiler exits zero", async (t) => {
  const h = fixture(t);
  writeFileSync(
    join(h.cwd, "fake-build.cjs"),
    `
    const fs = require('node:fs');
    process.on('SIGTERM', () => process.exit(0));
    fs.writeFileSync('ready', 'yes');
    setTimeout(() => process.exit(9), 2000);
  `
  );
  const running = h.invoke();
  const deadline = Date.now() + 1500;
  while (!existsSync(join(h.cwd, "ready")) && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 10));
  assert.equal(existsSync(join(h.cwd, "ready")), true);
  process.emit("SIGTERM");
  const result = await running;
  assert.equal(result.code, null);
  assert.equal(result.signal, "SIGTERM");
  assert.equal(h.marker("turbopack"), true);
});

test("the CLI forwards caller-supplied Next build flags", async (t) => {
  const h = fixture(t);
  const { spawnSync } = await import("node:child_process");
  mkdirSync(join(h.cwd, "node_modules/next/dist/bin"), { recursive: true });
  writeFileSync(
    join(h.cwd, "node_modules/next/dist/bin/next"),
    "require('node:fs').writeFileSync('argv.json', JSON.stringify(process.argv.slice(2))); "
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./build-with-cache-recovery.mjs", import.meta.url)),
      "--webpack",
      "--debug-prerender",
    ],
    { cwd: h.cwd, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(h.cwd, "argv.json"), "utf8")), [
    "build",
    "--webpack",
    "--debug-prerender",
  ]);
  assert.equal(h.marker("turbopack"), true);
});

test("failed output and both compile attempts survive cache recovery in a persistent log", async (t) => {
  const h = fixture(t);
  const result = await h.invoke({ FAIL: "first", DIAGNOSTIC: panic, RAILWAY_ENVIRONMENT_NAME: "" });
  const log = readFileSync(result.logPath, "utf8");
  assert.match(log, /range end index 123/);
  assert.match(log, /build complete/);
  assert.match(log, /"stage":"compile-1","event":"failed"/);
  assert.match(log, /"stage":"cache-recovery","event":"success"/);
  assert.match(log, /"stage":"compile-2","event":"success"/);
  assert.match(log, /"stage":"build","event":"success"/);
});

test("log directory override retains failures and does not dump environment credentials", async (t) => {
  const h = fixture(t);
  const logDir = join(h.cwd, "host-logs");
  const result = await h.invoke({
    AHD_BUILD_LOG_DIR: logDir,
    SENTRY_AUTH_TOKEN: "fixture-secret",
    FAIL: "always",
    DIAGNOSTIC: "compile failed",
  });
  assert.equal(result.code, 7);
  assert.equal(result.logPath.startsWith(logDir), true);
  const log = readFileSync(result.logPath, "utf8");
  assert.match(log, /compile failed/);
  assert.match(log, /"stage":"build","event":"failed"/);
  assert.doesNotMatch(log, /fixture-secret/);
});

for (const pruneCode of [0, 9]) {
  test(`image packaging records map cleanup and preserves prune exit ${pruneCode}`, async (t) => {
    const h = fixture(t);
    mkdirSync(join(h.cwd, ".next/server"));
    writeFileSync(join(h.cwd, ".next/server/page.js.map"), "map");
    writeFileSync(join(h.cwd, ".next/server/page.js"), "code");
    const result = await h.invoke(
      {},
      {
        packageImage: true,
        pruneCommand: process.execPath,
        pruneArgs: ["-e", `console.log('prune output'); process.exit(${pruneCode})`],
      }
    );
    assert.equal(result.code, pruneCode);
    assert.equal(existsSync(join(h.cwd, ".next/server/page.js.map")), false);
    assert.equal(readFileSync(join(h.cwd, ".next/server/page.js"), "utf8"), "code");
    const log = readFileSync(result.logPath, "utf8");
    assert.match(log, /"stage":"remove-source-maps","event":"success"/);
    assert.match(log, /prune output/);
    assert.match(
      log,
      new RegExp(
        `"stage":"prune-production-dependencies","event":"${pruneCode ? "failed" : "success"}"`
      )
    );
    assert.match(log, new RegExp(`"stage":"build","event":"${pruneCode ? "failed" : "success"}"`));
  });
}

test("failed compile never runs image packaging", async (t) => {
  const h = fixture(t);
  const result = await h.invoke(
    { FAIL: "always", DIAGNOSTIC: "compile failed" },
    { packageImage: true }
  );
  assert.equal(result.code, 7);
  assert.doesNotMatch(
    readFileSync(result.logPath, "utf8"),
    /remove-source-maps|prune-production-dependencies/
  );
});

test("map cleanup errors identify the failed stage and stop before pruning", async (t) => {
  const h = fixture(t);
  const logDir = join(h.cwd, "host-logs");
  rmSync(join(h.cwd, ".next"), { recursive: true });
  await assert.rejects(h.invoke({ AHD_BUILD_LOG_DIR: logDir }, { packageImage: true }), /ENOENT/);
  const log = readFileSync(join(logDir, readdirSync(logDir)[0]), "utf8");
  assert.match(log, /"stage":"remove-source-maps","event":"failed","code":"ENOENT"/);
  assert.match(log, /"stage":"build","event":"failed"/);
  assert.doesNotMatch(log, /prune-production-dependencies/);
});
