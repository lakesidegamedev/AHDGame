---
date: 2026-10-31
title: Sector page shows unsold output and real losses
summary: >-
  The pricing panel now reports what actually sold last turn, and a plant whose
  output went unsold shows its real loss instead of a few dollars.
tags: [corporations, sectors, market, ui]
badges: [patch]
areas: [frontend, backend]
---

A plant that sold none of its output could still show "100% sold last turn" and
a clearing result of x1.00 in the pricing panel. The panel now reads last turn's
actual sales: the share sold to buyers, the share sent to your own sites shown
separately, and a clearing result of x0.00 when nothing sold.

The same plant's net profit on the sector page could read as a loss of a few
dollars while it lost its whole running bill. The page now shows the profit the
turn actually booked.

Output that cannot be stored, such as electricity, and stock written down or
lost in storage are no longer counted as stock added at cost. They are gone, so
your company result now treats them as the loss they are.
