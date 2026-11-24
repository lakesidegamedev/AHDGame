---
date: 2026-11-24
title: "The rest of the economy steps up for goods that stay short"
summary: >-
  When a good stays badly short for several turns, the background seller for it
  grows toward the missing demand, and countries outside the player economies
  can buy from it too. Companies still always sell first.
tags: [economy, market, trade]
badges: [minor]
areas: [engine]
---

The background "rest of the economy" seller now responds to goods that stay
short:

- **Short goods.** If buyers have gone without more than 15% of a good for three
  turns in a row, its background seller grows toward the missing demand, enough
  to bring the shortage down to about 10%, and never beyond 40% of demand. As
  companies add supply it shrinks back by itself.
- **Exports.** Countries outside the player economies can buy from it once
  buyers at home have been served, so their unfilled import orders no longer
  keep prices climbing.

It never takes a sale from a company. It only fills what companies could not,
shoppers move their unspent budget to companies' unsold stock before it, plants
plan their runs on its normal size only, and companies' final purchases from it
use cash they hold, never their supply credit.
