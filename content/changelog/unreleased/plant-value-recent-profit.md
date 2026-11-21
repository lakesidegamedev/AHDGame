---
date: 2026-11-21
title: Company value follows recent profit, not a single turn
summary: >-
  Each plant is now valued on its average profit over its last four paid
  turns, so one bad turn no longer knocks a fifth off a company's share price
  only for the next turn to put it back.
tags: [corporations, market]
badges: [patch]
areas: [engine]
---

- A plant's value used to be its profit from the latest turn alone, as if that
  turn would repeat forever. A company that had one short turn, for example
  because it could not buy enough of an input, lost a large slice of its market
  cap and share price, and got it back the next turn.
- Plants are now valued on their average profit over their last four paid
  turns. A company that alternates good and bad turns keeps a steady value in
  between, while real growth or a lasting decline still shows in full within
  four turns.
- Turns where companies were not paid, such as a paused turn, are left out
  rather than counted as zero profit. A new plant averages the turns it has.
- Nothing jumps on the day this arrives: each plant starts from its latest
  turn and builds up its average over the next few turns.
