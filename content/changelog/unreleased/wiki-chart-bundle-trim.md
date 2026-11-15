---
date: 2026-11-11
title: Wiki charts no longer download the game engine into the browser
summary: >-
  A small helper import pulled the turn engine, budgets and law books into the
  browser bundle behind wiki charts. Pages that show those charts now load less
  code.
tags: [performance, wiki]
badges: [patch]
areas: [frontend]
---

## What changed

- The helper that reads which world preset is active now lives in its own
  small file, so browser code that needs it no longer drags in seed budgets,
  turn phases and every country's law book.
- Two tidy-ups that came up along the way: Canada's law book is imported from
  its country folder directly, and a long comment on Canada's budget was
  shortened.
