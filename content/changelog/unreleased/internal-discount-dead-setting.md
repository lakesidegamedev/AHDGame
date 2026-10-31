---
date: 2026-10-31
title: Internal discount hidden where it had no effect
summary: >-
  On worlds running the funded market, the internal supply panel no longer
  offers a discount that never applied.
tags: [corporations, economy, ui]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- On funded-market worlds, output sent to your own plants is a free transfer.
  The internal supply panel now hides the "Internal discount" choice and the net
  discount credit or charge line there, and says so in one sentence.
- Supply priority and the out-of-state option are unchanged.
- Worlds still on the legacy market are unchanged.
