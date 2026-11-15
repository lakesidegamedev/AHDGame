---
date: 2026-11-09
title: "Admin emergency switches for crises, conflicts and eras work again"
summary: >-
  The admin toggles for automatic crises and disasters, living conflicts and the
  decade era system now actually stop those systems when switched off. They stay
  on by default.
tags: [admin, crises, conflicts]
badges: [patch]
areas: [engine, backend, fullstack]
---

Switching these off in the admin panel had stopped doing anything. They are real
emergency switches again, and the panel now shows them as on unless an admin has
explicitly turned them off.

Local singleplayer worlds that were set up with Era progression, Living conflicts
or Automatic crises and disasters unticked had those boxes ignored until now. On
the next start those three are turned back on once, so an older save keeps
advancing eras and running conflicts. You can still switch them off afterwards.
