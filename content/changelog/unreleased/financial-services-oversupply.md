---
date: 2026-11-23
title: Financial services output follows what buyers take
summary: >-
  When far more financial services are offered than buyers take, branches now
  make less of them each turn, and a branch losing money is no longer kept at
  full output just to supply its own company's other sites.
tags: [corporations, banking, market]
badges: [patch]
areas: [engine]
---

## What changed

- When last turn left financial services unsold, this turn's output is trimmed
  so world supply sits about 5% above what buyers took. The trim is worked out
  again every turn and ends by itself once the market sells out. It never cuts
  below half in one turn.
- Only financial services are trimmed. A branch that also makes software keeps
  its full software output. A branch that makes only financial services runs
  less, so it also buys fewer inputs.
- A company about to stop for lack of cash is not counted as supply, so its
  stopping cannot leave buyers short.
- A site that lost money and left output unsold is no longer held at full
  output to supply its own company's other sites. Its normal output rules apply,
  and the other sites buy any shortfall.
