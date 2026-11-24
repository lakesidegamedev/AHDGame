---
date: 2026-11-24
title: Financial services output is no longer halved while buyers are short
summary: >-
  The financial services glut cut could halve every bank's output for a turn
  even when buyers were going without. It now only trims supply when output was
  really left unsold and buyers were fully served.
tags: [economy, corporations, banking]
badges: [patch]
areas: [backend]
---

## What changed

- When a large financial services producer missed a production run, its return
  the next turn could be read as a glut. The cut then halved financial services
  output for every producer, while households and businesses were getting only
  about half of what they wanted. Banks that also make software kept paying for
  a full run and lost the halved output, so their branches ran at a heavy loss.
- Units a company delivers to its own sites now count as taken, not unsold.
- The cut no longer applies in a turn after buyers were left short of financial
  services. Unsold units in a short market are out of reach or over the buyers'
  price, not surplus.
- A real glut, with output unsold and buyers fully served, is still trimmed as
  before.
