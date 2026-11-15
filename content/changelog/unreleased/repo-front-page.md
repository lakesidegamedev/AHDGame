---
date: 2026-11-15
title: Repository front page and root cleanup
summary: >-
  The repository README is now a proper front page with screenshots, a feature
  overview, an architecture diagram and a map of the codebase. Retired hosting
  configuration and old internal planning notes are gone from the repository.
tags: [docs, repository, contributing]
badges: [patch]
areas: [fullstack]
---

## What changed

- The README leads with what the game is, links to play, docs and Discord, and shows demonstration-data screenshots, a system overview, the tech stack and a repository map.
- The full local development guide moved from the README into CONTRIBUTING.md under "Local development".
- World simulation planning and money-movement qualification docs moved out of CONTRIBUTING.md to sit beside their tooling in `scripts/sim/README.md` and `scripts/perf/README.md`.
- Removed configuration for hosting providers the game no longer uses (`railway.toml`, `railway.worker.toml`, `nixpacks.toml`, `.vercelignore`) and the committed planning notes under `docs/superpowers/`.
