---
date: 2026-11-15
title: Building no longer draws on a stored market size
summary: >-
  Building, founding, cancelling and abandoning plants no longer move any stored
  "unowned market" balance. Only your cash and what the goods market will buy
  limit a build.
tags: [economy, corporations, nationalization]
badges: [minor]
areas: [backend, engine]
---

## What changed

- Building capacity, founding a sector and cancelling a build no longer draw
  from or return to a stored unowned market. What limits a build is your cash
  and whether the goods market can sell the output.
- The market split action is gone. Capturing market share now happens only by
  building, buying, or attacking a rival's plants.
- A plant that leaves its owner (abandoned, dissolved or sold off in a default)
  is picked up by a computer-run company as before. Whatever is not picked up
  simply stops producing, and the shortage it leaves is room for any builder.
- Industry-wide nationalization laws no longer have an "unowned market only"
  option, and sector takings no longer add free capacity from a market ceiling.
  A law takes plants from the companies that hold them, with the usual
  compensation. Laws already enacted with the old option take nothing extra.
- When a country seizes a company that holds plants abroad, the host country's
  own state enterprise takes those plants. If the host has none, the plants
  close and the buyout already paid for them.
- Region transfers, secessions and mergers no longer move any market balance.
