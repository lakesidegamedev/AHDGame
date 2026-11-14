---
date: 2026-11-12
title: "Keep Canadian provincial election labels lightweight"
summary: >-
  Canadian provincial election labels retain their scheduled years without
  loading the provincial scheduling module into client imports.
tags: [canada, elections, performance]
badges: [patch]
areas: [frontend, engine]
---

The shared election formatter now uses the small provincial anchor table and an
import-free year calculation. Opening election dates, four-year cycles, and
founding-phase offsets remain unchanged. Both lightweight modules are covered
by the client import checks, and the existing boundary is preserved.
