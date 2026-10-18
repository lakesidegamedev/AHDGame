---
date: 2026-10-18
title: Patch audited dependency vulnerabilities
summary: >-
  Updated existing image-processing and shell-quoting dependencies to patched
  compatible releases identified during the cleanup security audit.
tags: [maintenance, security, dependencies]
badges: [patch]
areas: [backend]
---

## What changed

- Updated sharp and its platform binaries to 0.35.5 with patched image libraries.
- Raised the shell-quote override floor to 1.11.0 and locked the compatible patched release.
