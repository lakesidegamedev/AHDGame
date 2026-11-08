---
date: 2026-11-08
title: Shareholder payouts, double clicks and party ballots behave correctly
summary: >-
  NPP shareholders now receive their share when a company is wound up or
  bought out, several actions can no longer be applied twice by a double
  click, stuck crises and records close properly, and party and union
  ballots only open when your vote will actually count.
tags: [economy, corporations, parties, crises, events]
badges: [patch]
areas: [engine]
---

## What changed

- When a company was dissolved, defaulted, bought out or nationalised, the
  slice owed to NPP shareholders was taken from the payer but paid to no
  one. NPP shareholders are now paid.
- Group loss relief now takes the money from the treasury before paying the
  company, in the treasury's own currency, so a refused payment no longer
  leaves the company paid anyway.
- Double clicks or two people acting at once can no longer apply an event
  choice, a coalition invite or join
  acceptance, a CEO offer acceptance or a growth change twice.
- Treasury spending no longer loses a concurrent change to the balance.
- Expired share listings return every seller's shares even if one return
  fails; finished prospect surveys can no longer
  grant capacity twice; and one bad international organisation item no
  longer skips dues and expiries for the turn.
- Event outcomes that add or remove campaign funds now reach the campaign's
  spendable money.
- Merged parties stop opening leadership and committee races, a retired
  character can no longer be confirmed to a cabinet, court or central bank
  seat, and extraction contracts held by a company that no longer exists
  now close.
- Committee ballots stay closed during the new-member waiting period, union
  president ballots stay closed when your vote would be refused, and new
  members can run and vote in founding caucus chair races.
- Shares held by non-player politicians are
  paid out in hostile takeovers and privatization buyouts instead of
  disappearing, and a failed write while collecting caucus tax no longer
  discards the tax already taken from other members.
