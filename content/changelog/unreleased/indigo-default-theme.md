---
date: 2026-11-25
title: "Default theme moves to indigo"
summary: >-
  The default theme's buttons, links and selected states are now indigo, tuned
  for the dark background. Text on filled buttons is readable on every theme,
  and disabled buttons look disabled.
tags: [ui, themes, accessibility]
badges: [patch]
areas: [frontend]
---

On the default theme, filled buttons are now indigo with white text. Outline
buttons use a lighter indigo border with pale indigo text, and links and
selected states switch at the same time, so no old violet sits next to the new
colour. The other eleven themes keep their own colours.

Text on filled buttons now uses a colour picked for each theme. On themes
where white text was hard to read against the main colour (OLED, Pastel, Dark
pastel, Retro, Solarized, Cold War and Command 1953), filled buttons now use
dark text.

Disabled buttons now show a plain grey surface with muted text on every
theme, instead of a faded version of the main colour.
