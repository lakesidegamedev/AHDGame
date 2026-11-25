---
date: 2026-11-25
title: "Readable links and visible focus on every theme"
summary: >-
  Violet links, tabs and ghost buttons, and grey secondary text on raised
  cards, now meet the standard contrast for body text on all twelve themes.
  Every control shows a clear focus ring when you move through the page with
  the keyboard.
tags: [accessibility, themes, ui]
badges: [patch]
areas: [frontend]
---

Coloured text such as links, tabs and outline buttons now uses a slightly
brighter shade of each theme's main colour on the Default, USA, Pastel,
Solarized and Cloakroom themes, so it stays readable on the page and on cards.
Filled buttons keep their current colour.

Secondary grey text on raised cards was a little too faint on the OLED, Dark
pastel, Retro, Solarized and Cloakroom themes. It is now slightly lighter (or
darker on light themes) so it reads clearly.

Every button, link and field now shows a focus ring in the theme's colour when
you reach it with the keyboard. A few fields that had no visible focus state,
including the build count stepper, the Ask panel's length picker and the season
recap's page controls, now show one.
