## What & why

<!-- What does this change, and what problem does it solve? Link the issue. -->

## Checklist

- [ ] Lint, format, typecheck, and tests pass locally (the CI gate)
- [ ] New/changed API routes have integration tests
- [ ] Changelog note added under `content/changelog/unreleased/` (`npm run changelog:new`)
- [ ] No balance constants changed — or a worldsim report is attached
- [ ] Turn performance change: aged-world gate verdict pasted (`npm run perf:aged-benchmark -- ... --baseline before.json`, see `scripts/perf/aged-benchmark.ts`), or not a turn-path change

## Conflict of interest

<!-- See "Conflicts of interest" in CONTRIBUTING.md. You do not need to name your character or corporation here; you can disclose to a maintainer privately. -->

- [ ] This change does not directly affect a character, corporation, or other in-game holding of mine
- [ ] It does, and I have disclosed it below or privately to a maintainer
