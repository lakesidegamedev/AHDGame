---
title: "Connect v2 legislative votes to voter reactions"
date: "2026-11-04"
summary: "V2 legislative votes now affect policy positions and demographic approval when laws are enacted."
badges: [patch]
areas: [backend, engine]
tags: [legislation, demographics]
---

V2 law votes now affect a legislator's recorded policy positions. When a law is enacted, final For and Against voters receive opposite reactions from voter demographics, using the country's policy preferences. Abstentions are neutral. National and regional laws share the same rules, and enactment retries cannot award the reactions twice.

Demographic reactions now scale with the policy change and account for overlapping voter identities. Reversing the same policy change reverses its reaction. Household relief, childcare and reproductive laws have more specific preference mappings.

Corporate tax votes react to the change in the enacted rate or scheduled target. Cuts lower approval among low- and middle-income voters and raise it among high-income voters; increases reverse those effects. Rate updates and voter reactions settle together, and replayed enactments cannot award them twice.

Bill-detail demographic indicators use the same reaction rules as enactment, including the current corporate-tax rate or scheduled target.

Fixed demographic approval decay getting stuck on small modifiers. Stored balances now retain their precision, fading by 0.5% per turn until they fall below the existing zero threshold.
