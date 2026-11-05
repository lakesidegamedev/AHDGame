---
date: 2026-11-05
title: "Field offices now live on the presidential map"
summary: >-
  In Campaign mode you can colour the map by field offices, zoom into a state's
  counties, and open or close an office from a county, without leaving the map.
tags: [elections, campaigns, ui]
badges: [minor]
areas: [fullstack]
---

## What changed

- On a US presidential race in Campaign mode the map has two new colour-by views: Field offices: lean and Field offices: opportunity. Lean shows how each county leans. Opportunity shows where a new office would add the most turnout, and it is offered only to people who can manage the campaign, as before. Gold states hold offices, and counties with one of the campaign's offices carry a pin.
- Click a county in either view to see its lean, its share of the state, and for managers what a new office there is worth, with the Open office button and the cost. A county that already has an office shows Close office.
- The state panel lists the campaign's offices in that state with their strength and a Close button for people who can manage them.
- Open a field office in this state, in the Your campaign here block, now flies the map into that state's counties in the field-office view instead of jumping to the Field offices tab. Old links with tab=field and a state open that state on the map in the same view.
- The Field offices tab keeps its totals, upkeep, the list of current offices and the explanation, and points at the map instead of drawing a second county map.
- On a phone the map stays locked by default, so the state panel lists the best counties for a new office and you can open one from there.
- Anyone viewing a rival's campaign sees the same thing the Field offices tab showed them before: where the offices are, and the lean view, with no costs or values.

## Developer notes

- The field-office views are `fieldLean` and `fieldValue` in `MapDataView`. County rows come from the existing `/api/campaigns/[id]/field-offices` route through `useFieldOfficeLayer`, which the map reads for the open state only. Fill helpers moved from `fieldOfficeMapMath.ts` to `presMap/fieldOfficeMath.ts` next to the other data views, with the pure view and ranking rules.
- `PresidentialMap` takes a `fieldOffices` config from `useRaceMapCampaign` (Campaign mode, US races with field offices). Access follows the route: managers get opportunity and costs, everyone else lean and office locations. No server rule changed.
- `MyCampaignStateBlock` reaches the map through `FieldOfficeMapProvider`, so the link flies the map into the state and falls back to the campaign link where there is no map.
- `FieldOfficesSection` no longer draws the county map. It takes `mapOnPage`, `mapHref` and `reloadKey`, and reloads when the campaign's office count changes.
