---
date: 2026-11-15
title: Tidier repository root
summary: >-
  The repository root now holds only the files tools require there. Tests,
  shared formulas, tooling and community policies moved into
  the folders they belong to, with no change to how the game behaves.
tags: [repository, tooling]
badges: [patch]
areas: [fullstack]
---

## What changed

- `e2e/` moved to `tests/e2e/`, and the test setup file to `tests/setup.ts`.
- The positions atlas moved to `scripts/analysis/positions-atlas/`, and the Semgrep rules to `.github/semgrep.yml`.
- `shared/` moved to `src/shared/`; the `@shared/*` import alias is unchanged.
- The code of conduct and security policy moved to `.github/`, where GitHub still lists them.
- The two root changelog guides merged into `content/changelog/README.md`.
- Prettier and Knip settings moved into `package.json`.
