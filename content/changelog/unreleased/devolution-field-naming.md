---
date: 2026-10-26
title: Page text that showed as raw labels is back
summary: >-
  The Devolution tab and other in-page panels showed labels such as
  "nav.devolution.independenceDesire" instead of their text. They read normally
  again.
tags: [interface, devolution, translations]
# One of: major | minor | patch | hotfix
badges: [hotfix]
# Any of: backend | frontend | fullstack | engine
areas: [frontend]
---

## What changed

- The Devolution tab on the Prime Minister's office and each First Minister's
  office shows Independence Desire and Reunification Desire, last turn's
  movement, the yearly forecast, the time to the referendum threshold and both
  governments' stances again. The numbers were updating every turn, but the
  sentences that carry them rendered as raw labels.
- The same fix restores navbar-section and tutorial text wherever a page used it
  inside its own content.

## Cause

The faster-pages release split the translation catalog in two: the site frame
sends the navbar and tutorial text, and each page adds its own. The page half
replaced the frame's text instead of adding to it, so anything inside a page that
used navbar or tutorial text lost it, for staff and players alike. The page half
now adds to the frame's text instead of replacing it.
