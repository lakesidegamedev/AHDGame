---
title: Preserve deployment build diagnostics
date: 2026-11-11
badges: [patch]
areas: [backend]
tags: [deployment, build, diagnostics]
---

Builds retain compiler output and stage results in persistent-cache log files.
Image packaging can record compilation, source-map cleanup and dependency pruning
separately. Verified compiler-cache recovery now works on self-hosted deployments,
and static-generation workers are limited to one to reduce peak memory use.
