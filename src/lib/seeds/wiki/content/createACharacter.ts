export const createACharacterContent = `# Create a Character

One character per account. A few of the choices are expensive to undo, so make them in this order and read the notes before you confirm. This page covers every screen of creation and what you start with.

## How it works

1. Log in with an account that has no living character. You are sent to **Create Character** automatically.
2. Some worlds require a linked Discord account before you can create a character. The page tells you if yours does.
3. Work through the steps below, then confirm. You land on your profile with your starting kit.

If you already have a character, you cannot open creation until you retire it (see the end of this page).

### 1. Country

Pick the country you actually want to play. It scopes your elections, parties, legislature and who you can wire money to. You cannot campaign across countries, and a later country change resets your National Influence and your party (see [Relocation](/wiki/relocation)).

![Create character screen with the list of open countries in the Country step](/wiki-images/screens/create-a-character-country-picker.webp)

| Country | Home you pick | First office most people target |
| --- | --- | --- |
| United States | State | State Senate, then House |
| United Kingdom | England, Scotland, Wales or Northern Ireland | MP (Commons) |
| Germany | Land | Bundestag (MdB) |
| Japan | Region | Shūgiin or Sangiin |
| China | Macro-region | NPC delegate (one-party, with a disclaimer on pick) |
| Ireland | Region | TD (Dáil) |
| Brazil | State or macro-region | Federal Deputy |
| Nigeria | Zone | Assembly Member |
| Soviet Union | Republic | Supreme Soviet or Nationalities Deputy |
| East Germany | Land | Volkskammer Deputy |

**Why the list is shorter than this table:** only countries open to players in your world appear in the picker. At the start of a world, the United States, United Kingdom and Japan are open in the 1991 to 2023 presets, the United States, United Kingdom, Soviet Union and East Germany are open in the 1953 and 1979 presets, and the United States, United Kingdom, Germany, Japan and China are open in the 2027 preset. Other countries run as economies or as non-player politicians until they are opened later in a world's life.

If you cannot pick the Soviet Union, you are in a world set after 1990, where it no longer exists. The country hubs from [Getting Started](/wiki/getting-started) cover each one.

### 2. Name and avatar

Type a readable name. There is no separate last-name field. An avatar is optional, and you can change the image later in Settings.

### 3. Home state or region

Home is where you canvass cheapest and where most local races live. Races for state or regional seats can only be entered from your home. National races such as President and Prime Minister are the exception. You can [relocate](/wiki/relocation) later, but you lose your state Political Influence and donor network when you do, so pick once, carefully.

### 4. Policy positions

Two sliders, each from -5 to +5:

- **Economic:** -5 is left, +5 is right.
- **Social:** -5 is progressive, +5 is conservative.

These feed primaries (your distance from the party), bill voting and how demographic groups see you. They are not locked: each bill you vote on can move you at most 0.25 per axis. An Aye pulls you toward the bill's average position, never past it. A Nay pushes you away. Changing your vote later is measured from where you stood before that bill, so flipping Aye and Nay cannot stack. The vote buttons show the exact move before you click.

**Do your sliders lock you out of parties?** No. You can join any party that is open to your region, and approval-gated parties need an application. The sliders only change how well you score once you are in.

**Worked example.** You set Economic -2 and Social -1 and join a party whose platform is -3 and -2. Your gap is 1 on each axis, so 2 in total. Party alignment in a primary is worth up to 15 points and drops by 0.75 per point of gap, so you score 13.5 of 15. A character at +2 and +2 in the same party has a gap of 5 plus 4, which is 9, and scores 8.25. That 5-point difference is real but not decisive, because favorability and influence are worth more. The formulas are on [Reference: Formulas](/wiki/reference-formulas).

Do not slam both sliders to an extreme unless that party really is extreme, since moderate parties punish extremes in the primary.

### 5. Wealth background and stats

Pick a wealth background: **Low Income**, **Medium Income** or **High Income**. It sets your personal Cash on Hand and your starting income tier. Where the world uses the stats system, you also spend **28 points across seven stats** (Charisma, Debate, Energy, Fundraising, Business Acumen, Statecraft and Intellect), each from 1 to 10 with a minimum of 1, which leaves 21 points to place. See [RPG Stats](/wiki/rpg-stats) for what each one does.

### 6. Confirm and take your kit

| Starting kit | Value |
| --- | --- |
| Actions | 25 (one-time) |
| Campaign Funds | ₳250,000 (local-currency equivalent) |
| Cash on Hand | ₳1,000,000 (Low), ₳2,500,000 (Medium) or ₳5,000,000 (High), scaled down in earlier eras |
| Political Influence | 10 |
| National Influence | 0 |
| Favorability | 50 |
| Infamy | 0 |
| Donor Base level | 1 |
| Party | Independent, unless you chose an open party at creation |
| Office | none |

Characters who joined through a referral also get +10% Political Influence and Favorability, +10 actions and ₳500,000 more Cash on Hand (era scaled). Where the starter checklist is on, a welcome mail from the Game Guide also arrives in [Mail](/wiki/mail). For your first three days, a first-days panel on your profile lists three goals: campaign at home three times, join a party that takes members from your region, and enter a local race still taking candidates. Your name appears in your home state's player list.

| Key number | Value |
| --- | --- |
| Characters per account | 1 |
| Stat points to spend | 28, across 7 stats, 1 to 10 each |
| Policy slider range | -5 to +5 on each axis |
| Max move from one bill vote | 0.25 per axis |
| First-days panel | 72 hours |

## What you can do

**Right after you confirm:**

1. Open **Parties** and join one close to your sliders.
2. Open **Dashboard** and spend Campaign actions.
3. Continue on [Getting Started](/wiki/getting-started).

**Start over with a different character.** Open **Settings**, find **Retire character**, and type your character's name exactly to confirm. The character moves into your retired characters archive, where its record is kept, and you are sent back to Create Character. Retiring clears the character from the game, so do it only when you mean it. There is no separate delete step.

**Change your mind later:** policy positions move only by voting on bills. Name and avatar changes are in Settings. Home and country change through [Relocation](/wiki/relocation).

Tips:

- Join a party the day you create. Skipping it for two days leaves bonus actions and primaries on the table.
- A tiny home state for "easy wins" means lower donor income and fewer races.
- Fundraise needs a donor base above 0. You start at level 1, so you can use it right away, but it pays more once your donor level and Political Influence are higher.

## Your first week

- [ ] Country and home region chosen on purpose, not at random.
- [ ] Policy sliders within a few points of the party you joined.
- [ ] Party joined the same day you created.
- [ ] Starting actions not dumped into Fundraise before Donor Level 2.
- [ ] First race identified on **Elections** (poll before declare).

## Connections

**Driven by**

- [Game Starting State](/wiki/game-starting-state): the world's era decides which countries and parties you can pick.

**Affects**

- [Getting Started](/wiki/getting-started): your country and kit set your first week.
- [Stats & Actions](/wiki/stats-actions): your seven stats and starting meters come from this step.
- [Relocation](/wiki/relocation): your first home is the one you can later move away from.
- [Player Progression](/wiki/player-progression): your country decides the office ladder you climb.
- [First Campaign Walkthrough](/wiki/first-campaign-walkthrough): its starting kit is what that plan spends.

## Status

Character creation is open in every world unless it is closed for maintenance. Which countries you can pick depends on the world's era and what has been opened so far. Some worlds require a linked Discord account first.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Creation has no separate design page. The starting meters and costs are on the [Stats & Actions design page](https://docs.lakesidegames.net/design/stats-actions.html), and the first-hours flow is on the [Getting Started design page](https://docs.lakesidegames.net/design/getting-started.html).
`;
