---
date: 2026-11-13
title: "Season recap no longer skips to the end with animations off"
summary: >-
  The season recap plays through every slide on phones that have animations
  turned off or reduced motion on.
tags: [frontend]
badges: [patch]
areas: [frontend]
---

## What changed

- The season recap no longer skips to the end when the phone has animations turned off.
- With reduced motion on, each slide waits for a tap, with a "Tap to continue" hint, and the answer to the "what did you do most" question stays up until you move on.
- With animations on, the recap plays exactly as before.
