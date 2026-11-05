---
date: 2026-11-05
title: Builds due during an economy pause now arrive when it ends
summary: >-
  New capacity you paid for is no longer lost if its build finishes while the
  economy is paused. It arrives in full on the first turn after the pause.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- When the economy was paused, a build that was due to finish during the pause
  was removed from your queue without adding its capacity. You paid for it and
  got nothing.
- Builds that ran through part of a pause also arrived short, because the
  paused turns were skipped.
- Now every bit of capacity that came due during the pause arrives on the
  first turn the economy runs again. A build still under way keeps going from
  where it should be.
- Normal turns work exactly as before.
