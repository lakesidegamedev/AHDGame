---
date: 2026-11-28
title: "Campaign media spending reaches voters again"
summary: >-
  Presidential campaigns' Media Spending now buys spare airtime across the
  country when its home state is sold out, so the favorability it pays for
  lands.
tags: [elections, campaigns, media, economy]
badges: [patch]
areas: [fullstack]
---

Media Spending in a presidential campaign buys airtime from media companies
each turn. It used to shop only in the campaign's target state. In busy media
states such as New York and Florida, regular advertisers bought nearly all the
airtime first, so most campaigns got almost none, and almost none of the
favorability they were paying for. The unspent money was refunded.

A presidential campaign's media budget now buys spare airtime anywhere in its
country once its target state is sold out. The target state's own buyers still
get first claim on its stations, and player Targeted Ads still stay in the state
they target. Favorability still scales with how much airtime the campaign
actually bought.

Media companies now keep what campaigns pay them for airtime. Before, that
payment was taken back out of their cash in the same turn.

Some political ad orders could get stuck after a rounding error in the order's
math and hold the campaign's money without refunding it. New orders no longer
hit that error.
