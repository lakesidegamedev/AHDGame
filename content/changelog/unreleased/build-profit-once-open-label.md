---
date: 2026-11-23
title: The build screen says when its profit figure applies
summary: >-
  The expand sector screen now labels its profit figure as profit per turn once
  the new capacity is open, so it is not read as a loss during construction.
tags: [corporations, construction]
badges: [patch]
areas: [frontend]
---

## What changed

- "Profit per turn" on the expand sector screen is now "Profit per turn once
  open". The figure was always the forecast after the new plants open, after
  running costs, overhead and tax, not a cost paid while they are being built.
