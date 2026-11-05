---
date: 2026-11-05
title: "Act on a state from the presidential map"
summary: >-
  In Campaign mode the presidential map sits above your campaign desk, and
  clicking a state opens that state's campaign actions: travel or camping,
  operations against rivals, and canvassing.
tags: [elections, campaigns, ui]
badges: [minor]
areas: [fullstack]
---

## What changed

- On a US presidential race, Campaign mode now shows the map above the campaign desk. It opens on the Your campaign colouring, so the states where your ticket has presence stand out.
- Click a state to open its panel. If you are the candidate you can travel there in the general election or camp there in the primary, with the cost shown on the button. The home-state surge appears in your home state's panel. In the primary you can also attack a rival in that state and see what is live there in both directions.
- Canvassing appears in the panel of the state you can canvass in.
- Campaign managers and the running mate now get the same Your campaign here block the candidate has had: the ticket's presence level in that state. Building presence stays with the candidate, and the field office link is shown to people who can manage the campaign.
- Each control shows only to people who could already use it. Viewing a rival's campaign, or one you are not on, shows the state's public overview and nothing else.
- On desktop the map is now the way into these actions, so the separate state operations list and the travel and camping panel no longer repeat beside the desk. Phones and races outside the US keep their compact lists.
- Old links with a state in them, such as the field office shortcut, open that state's panel on the map.

## Developer notes

- `useCampaignDesk` (`src/components/campaign/useCampaignDesk.ts`) now loads the campaign, the viewer's resources, the state operations hub and the canvass eligibility once. `CampaignWorkspace` and the map's state panel read the same copy, so an action on the map shows in the desk panes and the other way round.
- `CampaignStateActions` renders the panel extras through the map's `panelExtra`. Which sections appear is decided by `stateActionSections` in `src/lib/campaignManager/mapActions.ts`, from data the server only sends to people who may act: the state presence payload and the operations hub are the candidate's alone, canvassing follows the desk's manage access.
- `TravelControls`, `PrimaryCampaignControls` and `StatePresencePanel` take an optional `focusState` for the one-click move, and `StateOperationsHere` is the per-state slice of the operations section.
- `useMyCampaign` takes the ticket's candidate and whether the viewer is that candidate. For anyone else it reads the ticket's levels from the public race-wide presence list and offers no build action. No server rule or route changed.
- The stage map takes `inPage` so it starts locked inside the scrolling Campaign mode page.
