---
date: 2026-11-04
title: "Short local service markets can reopen to new healthcare firms"
summary: >-
  Behind a new stage switch, AI and autopilot companies read room in a state's
  healthcare, real estate and construction market from that state's unmet
  demand, not only from an unowned pool that never refills. Off by default;
  nothing changes until it is switched on.
tags: [economy, corporations, healthcare]
badges: [patch]
areas: [engine]
---

## What changed

- The unowned market pool in a state never grows back once the first firms use it up: its growth and the yearly reseed both multiply it, and zero times anything is zero.
- Healthcare, real estate and construction sell only in their own state, so a used-up pool closed the state to every new company and to autopilot growth, however short it was. On the latest turn California, New York, Florida, Pennsylvania and four Japanese regions had healthcare pools of zero while their healthcare was hundreds of thousands of visits short.
- With `nppStateServiceHeadroomStage` at 1, the AI pass reads room in these markets as the larger of the pool and the state's unmet demand, less capacity already being built there. The stored pool is unchanged.
- On the latest turn this opens 11 closed healthcare states and raises the combined founding size limit across healthcare markets from about 54,000 to about 445,000 units a day. Cash and the other entry checks still apply.
