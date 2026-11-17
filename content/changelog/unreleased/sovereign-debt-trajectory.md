---
date: 2026-11-17
title: Sovereign borrowing now prices the debt trajectory, not only its level
summary: >-
  A government's borrowing cost now reflects whether its debt ratio is rising or
  falling. A country stabilising or reducing its debt pays less than one whose
  ratio climbs, and the economy page says which way the debt is going and what
  primary balance would hold it flat.
tags: [economy]
badges: [minor]
areas: [backend, frontend]
---

## Borrowing cost

- The credit ladder still prices the debt level. On top of it the fiscal-year
  rollover now applies a trajectory premium of up to 2 points and a discount of
  up to 0.5 points, from the standard debt-dynamics identity: interest rate,
  nominal growth and the primary balance.
- A country adding 10 points of GDP of debt in a year pays about 1 point more;
  one shedding 10 points pays about 1 point less, until the bounds bind.
- The premium applies to the marginal rate, so bonds keep the coupons they were
  issued at and a single bad year cannot reprice a sovereign out of the market.
- The identity divides by nominal growth, which is real `gdpGrowth` plus signed
  inflation. Real growth alone understated the denominator and made an ordinary
  year look like a climb, charging almost every country the premium. Deflation
  counts: it shrinks nominal GDP, so a deflating country's ratio is priced on
  the smaller denominator rather than treated as if prices were flat.
- The effective rate is capped, and an IMF program still caps it further.

## Budget page

- A refinancing ladder groups outstanding sovereign face by the fiscal year it
  matures: how much reprices this year and in each of the next five, its share
  of the stock, its average coupon and what it pays in coupons now. Each row
  sets that average against today's effective rate and the gap in basis points,
  with a rising repricing cost in the warning tone, so a treasury can see which
  fiscal year the trajectory premium actually lands in. It makes clear the
  premium reaches the budget through rollovers rather than repricing the whole
  stock at once.
- A rate breakdown card shows what the effective sovereign rate is made of:
  the level ladder and rating, the investor confidence premium, the trajectory
  premium, and any IMF or hard-ceiling cap, with the prior fiscal close beside
  each row and the change in points. It is computed by the same composer the
  rollover charges from, so the rows always add up to the rate that applies.
- The debt path chart names the fiscal year the borrowing ceiling binds on
  the same path, or says it is not reached within five years. It compares each
  projected stock against the effective limit the annual ceiling check uses,
  including the East German GDP floor.
- A small debt path chart projects the ratio five years at today's primary
  balance, rate and nominal growth, with today's ratio as a dashed line and the
  primary balance needed to hold it flat stated underneath. It runs the same
  identity the year-end rollover prices, chained year on year.

## Minister projection

- Next year's projection card grew revenue by real GDP growth while spending
  grew by inflation plus demographic drift, so it understated revenue and
  overstated the deficit every inflationary year. Revenue now grows with the
  same real-plus-inflation rate the tax bases use, and the assumption line says
  so. The GDP denominator stays on the real series the stored debt ratio uses.

## Economy page

- The debt to GDP figure now states whether debt is rising, stable or falling,
  and for a rising ratio, the primary surplus that would hold it flat.
- The flat-balance figure and the budget chart now use one basis: the ladder
  rate the year-end rollover prices, before the confidence and trajectory
  premiums. Both surfaces label it, so the number shown is the number charged.

No new queries: the rollover already loads the budget it now uses, and the
economy page reuses the payload it already fetches.
