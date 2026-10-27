---
date: 2026-10-27
title: The banking page shows the savings rate you are actually paid
summary: >-
  The central bank list on the banking page now shows the same savings APY as
  each bank's savings desk, instead of a much higher figure for countries with
  high inflation.
tags: [banking, savings]
badges: [patch]
areas: [backend]
---

Central bank savings pay half the real prime rate: the prime rate minus local
inflation. The savings desk and the interest paid each turn already used that
rule, but the list on the banking page ignored inflation and showed half the
nominal prime rate. Turkey, for example, was listed at 10.63% while its desk
showed, and paid, 0.73%. The list now matches the desk for every country, and
the central bank rate offered next to private banks when you choose where to
hold savings uses the same corrected figure.
