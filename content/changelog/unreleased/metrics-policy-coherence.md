---
date: 2026-11-23
title: Correct policy labels and make metric trends auditable
summary: >-
  Policy pages honor saved choices. Metric details separate inherited law effects
  from policy changes, explain condition scores and show correctly spaced history.
tags: [metrics, legislation, government]
badges: [patch]
areas: [fullstack]
---

- Corrected policy names and effects when options share ideological coordinates.
- Show funded law contributions, opening-law baselines, Cabinet effects and the capped policy driver separately.
- Expose individual condition scores and explain how domain and overall scores are averaged.
- Space chart samples by turn and provide a table of sampled values.
- Freeze aggregation weights with new history samples. Older national samples lacking their original weights are explicitly unavailable; regional histories remain intact.
- Clarify provisional aggregation, recorded observations and index units.
