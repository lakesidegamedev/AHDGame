---
date: 2026-10-19
title: Keep the federation transaction check running on newer CI runners
summary: >-
  The federation transaction CI job now uses a database image that starts on
  newer runner kernels, so it no longer fails before any test runs.
tags: [ci]
badges: [patch]
areas: [backend]
---

## What changed

- Run the federation transaction job against MongoDB 8.2, which starts on Linux
  6.19 and newer.
