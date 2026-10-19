---
date: 2026-10-19
title: Share the migration index-plan runner
summary: >-
  Share the identical index-plan executor across fourteen migrations.
  Preserve entry-owned index definitions, execution order, dry-run reporting, and failure handling.
tags: [cleanup, migrations]
badges: [patch]
areas: [backend]
---

## What changed

- Reused one typed runner for fourteen index migrations while retaining their plans and metadata.
- Kept migrations with reconciliation, backfills, or existing-index checks unchanged.
- Kept collection discovery exact by tracing literal plans and removing obsolete dynamic-site records.
