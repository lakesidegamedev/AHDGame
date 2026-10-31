---
date: 2026-10-30
title: Economy resets respect the Soviet breakup
summary: >-
  An economy reset now rebuilds the world as it is, not as the 1991 start had
  it. After a federation breaks up, its continuing state gets only its
  sovereign issuer back, never the old command-economy conglomerate.
tags: [economy, russia, succession, reset]
badges: [patch]
areas: [backend]
---

## What changed

- When the Soviet Union has dissolved, an economy reset seeds Russia's state
  company as the "Russian Federation" sovereign issuer with no plants. The
  Soviet planned-economy conglomerate is no longer rebuilt in Russian regions.
- The same rule covers any federation whose breakup settlement has applied:
  its state company keeps its bond issuer identity and nothing else, and it is
  never seeded as a command economy.
- The reset keeps the currency a successor state actually uses instead of
  restoring the preset's opening currency.
