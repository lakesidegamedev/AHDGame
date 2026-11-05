---
date: 2026-11-05
title: "A shorter state panel in Campaign mode"
summary: >-
  The state panel on the presidential map now folds its sections away, and the
  help pages say to use Campaign mode on the race page.
tags: [elections, campaigns, ui]
badges: [minor]
areas: [fullstack]
---

## What changed

- In Campaign mode the state panel starts with Your campaign here and folds Travel (or Camping), Operations, Canvassing and Field offices behind their labels. Tap a label to open it. Choosing a field-office colouring opens the Field offices section.
- On a desktop US race the map is the way into canvassing, so the Canvassing panel no longer repeats under the map. Phones and races without the map keep it where it was.
- Picking Field offices: lean or opportunity with a state open on a locked map now unlocks the map and zooms into that state, as the Open a field office link already did.
- The button on the race page that opens your campaign now reads Open campaign. The wiki and in-game guides point to the Campaign switch on the race page instead of the old Campaign Manager page.

## Developer notes

- `CollapsibleSection` (`src/components/campaign`) wraps each section in `CampaignStateActions` and `FieldOfficeStatePanel`. The body is not mounted while folded, and `openWhen` opens it on a rising edge.
- `CampaignDeskView` hides the desk canvassing panel from `lg` up when `stateActionsOnMap` is set.
- Removed `officeCountyIds`, which the field-office map no longer used.
