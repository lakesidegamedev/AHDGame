---
date: 2026-11-15
title: "Reset rehearsals can open a founding round with starting parties"
summary: >-
  The reset rehearsal accepts the same founding-round switch as the reset
  itself, so a world with starting parties and empty offices can pass the
  rehearsal gate.
tags: [reset, tooling]
badges: [patch]
areas: [backend]
---

## What changed

- The rehearsal script reads `--pre-iteration` and `--no-pre-iteration` exactly as the reset command does, passes the choice to the reset, and records it in the settings fingerprint the live reset checks.
- Without it, a 2027 world with starting parties could only rehearse with seated incumbents, so a founding round with starting parties had no way through the gate.
