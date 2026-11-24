---
date: 2026-11-24
title: "Dissolve a company that still owes bonds"
summary: >-
  A CEO can now dissolve a company with bonds outstanding, as long as none
  has defaulted. Bondholders are paid first, then shareholders share what is
  left.
tags: [corporations, bonds]
badges: [patch]
areas: [fullstack]
---

Until now a private company with bonds outstanding could not be dissolved
unless one of its bonds had defaulted. You can now choose to dissolve it
while its bonds are still in good standing.

The dissolve screen shows how much the company owes bondholders, how much
they will receive, and what is left for shareholders. The money comes from
the company's cash, the sale of any bonds it holds in other companies, and a
share of its plants' value, the same as any other dissolve. Bondholders are
paid first, each in proportion to what they are owed and never more than
that. Shareholders share whatever remains. Dissolving cannot be undone, so
the screen asks you to confirm.

A company with a defaulted bond still settles through the bond default
screen, and public companies still need a passed shareholder vote.
