---
date: 2026-11-17
title: Share a map comparison with a link
summary: >-
  A comparison picked on the world map can be copied as a link, and opening that
  link lands on the world page with both nations already chosen and the panel
  open.
tags: [world]
badges: [minor]
areas: [frontend]
---

- Copy link in the comparison panel writes `/world?compare=FR,JP` to the
  clipboard, in panel order, from the current address so other world parameters
  survive.
- The link also carries the map filter and the panel category (`filter=blocs`,
  `cat=social`), so the receiver sees the same colouring and the same rows. Links
  written before this change carry no filter and open on the page defaults.
- Opening that link reads the two picks, opens compare mode and fills both
  sides. Unknown countries, duplicates and anything past the two slots are
  dropped, so a mangled link opens nothing rather than something wrong.
- The address bar follows the selection as it changes, and the parameter is
  removed when the comparison is cleared or closed, so a copied link always
  matches what the sender sees.
