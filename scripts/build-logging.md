# Durable deployment build diagnostics

`node scripts/build-with-cache-recovery.mjs` tees compiler stdout and stderr to
the console and a unique `.next/cache/build-logs/build-*.log` file. Structured
`[ahd-build]` markers identify start, success and failure, duration, exit code
and signal for each compile attempt and cache recovery. Environment values and
command arguments are not dumped. Treat compiler output as restricted operational
data; do not commit or publish build logs.

The existing BuildKit `/app/.next/cache` cache mount retains these files even
when a build layer fails. Logs are outside the compiler directories cleared by
recovery. A cache is not an archive: BuildKit garbage collection can remove it.
For longer retention, mount a host-owned log directory and set
`AHD_BUILD_LOG_DIR` to its container path, or export logs from the cache mount
after every build, including failures. Apply retention in the deployment host.
Do not store the logs only in the build layer or final application image.

## Deployment recipe integration

The Docker recipe is managed outside this repository. Replace its combined
compile / `find` / prune command with:

```sh
NODE_ENV=production node scripts/build-with-cache-recovery.mjs --production-image
```

Keep the existing secret and cache mounts. Keep the secret assignment in the
calling recipe without echoing its value. This mode runs the same compiler,
removes `.map` files under `.next`, then runs
`npm prune --omit=dev --no-audit --no-fund`. Every step shares one log and has
separate stage markers. A failed step stops packaging and keeps its nonzero
exit status. Ordinary `npm run build` and `npm run verify:build` still compile
without pruning; the former retains its existing postbuild action.

Use BuildKit plain progress and capture the deployment client's stdout/stderr
to a durable host-side log as well. Preserve the build command's exit status
when piping to a log collector. This outer log is required for cancellations,
OOM kills, cache-lock waits before the wrapper starts, and image push/activation
failures. A process killed by the host cannot write its own final marker.

## Recovery and resource limits

The verified Turbopack persistence-bounds panic triggers one compiler-cache
clear and retry on any host. Other failures and interruptions do not retry.
Recovery preserves cache mount roots, fetch caches and build logs.

Next configuration limits static-generation workers to one on all hosts,
including singleplayer packaging. This does not cap native Turbopack threads,
Node heap size or total container memory. The deployment host still owns those
limits and should record OOM/cancellation evidence separately.
