---
date: 2026-10-27
title: The banking page shows the savings rate you are actually paid
summary: >-
  The banking page now shows the same savings rates as each bank's savings
  desk: central banks no longer show a much higher figure for countries with
  high inflation, and private banks show what a saver actually earns.
tags: [banking, savings]
badges: [patch]
areas: [backend, frontend]
---

Central bank savings pay half the real prime rate: the prime rate minus local
inflation. The savings desk and the interest paid each turn already used that
rule, but the list on the banking page ignored inflation and showed half the
nominal prime rate. Turkey, for example, was listed at 10.63% while its desk
showed, and paid, 0.73%. The list now matches the desk for every country.

The Savings APY column for private banks, the rates shown when you choose where
to hold your savings, and the deposit window for a private bank now also match
what you earn. A private bank pays its premium over the central bank rate, and
the central bank rate still accrues on top, so the figure shown is the two
together. A bank whose posted rate sits below the central bank rate now shows
the central bank rate you still earn, instead of its lower posted rate.

The savings APY and per-turn interest estimate in your portfolio wallet now use
the rate of the bank that holds each balance, instead of always showing the
central bank rate.
