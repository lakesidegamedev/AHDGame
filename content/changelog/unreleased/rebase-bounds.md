---
date: 2026-11-24
title: Starting-value corrections leave research capability and rounding alone
summary: >-
  The tool that moves a running world onto corrected starting figures no longer
  caps research capability at 100 or rewrites values over rounding differences.
tags: [metrics]
badges: [patch]
areas: [backend]
---

## What changed

- Research capability and other relative scores that can exceed 100 are no longer cut to 100 when a running world's starting figures are corrected.
- Starting figures that differ only by rounding are left as they are.
