export const gameStartingStateContent = `# Game Starting State

Before you pick a country, it helps to know what board you are stepping onto. Every world begins from a fixed opening: default parties, generated non-player politicians (NPPs), starting treasuries, national numbers, sovereign debt, regional sector specialties and an unowned market in every sector. The opening you join decides which countries you can play, who sits in the legislatures and what the economy looks like.

## Which start date opens which countries

When a world is created, the game seeds one **era preset**. The preset sets the date, the historical seat counts, the party rosters that existed then, and which countries are open to players, which run as economies only and which are run by NPPs. Coverage is layered: a country open to players has a full political roster, while an economy-only country can have regions, budgets, currencies and trade without every player screen.

| Start date | What it opens for players | Notes |
| --- | --- | --- |
| 1953, early Cold War | United States, United Kingdom, Soviet Union, East Germany | Stalin has just died. Japan, China, West Germany, Brazil, Ireland and others run as economies. Democracies start with vacant legislatures, one-party legislatures start seated. |
| 1979, Cold War | United States, United Kingdom, Soviet Union, East Germany | China, Japan, West Germany, Brazil and Nigeria run as economies. Legislatures start vacant. |
| 1991 | United States, United Kingdom, Japan | US 102nd Congress, UK after the 1992 election, Japan after the 1990 election, Germany's 12th Bundestag. |
| 2019 | United States, United Kingdom, Japan | US 116th Congress, UK after the 2019 election, Germany, China and Ireland seated. Variants exist with no NPPs or no starting parties. |
| 2023 | United States, United Kingdom, Japan | US 118th Congress, a divided government. Other countries use their 2019 data. |
| 2027 | United States, United Kingdom, Germany, Japan, China | A projection with the latest completed elections. |

This is the roster at the start of a world. More countries can be opened to players later in a world's life, and the country picker in game is the authority. The era decides which countries and parties you can pick in [Create a Character](/wiki/create-a-character).

**Why it works this way:** a country is only opened to players when its political data is authored well enough to play. Other countries still run as economies, so trade, currencies and prices behave sensibly around you.

## Ideology scale

Economic and social positions each run from -5 to +5. Economic: -5 is far left and +5 is far right. Social: -5 is progressive and +5 is traditional or conservative. Starting platforms and NPP positions are set on this scale ([Party Ideology](/wiki/party-ideology)).

## What every opening seeds

- **Protected default parties**, with their platforms and starting treasuries ([Political Parties](/wiki/political-parties)).
- **Generated NPPs** ([NPP Behavior](/wiki/npp-behavior) starts from these seeds) with positions drawn from their party range and blended with their home region's lean, plus randomised favorability, loyalty and stubbornness.
- **National budgets, debt, credit ratings, tax bases and currencies**, using that era's values where they are authored.
- **Regional demographics and metrics** for that era.
- **An unowned market in all 17 sector types** in every region, and separate per-region capacity ceilings for extractable resources.

Parliamentary governments are assembled from the starting seats ([Coalition Formation](/wiki/coalition-formation)). The 1991 preset also anchors election cycles to the real 1992 to 1994 calendar, and leaves out parties that did not exist yet (for example AfD, Die Linke and Reform UK).

## Reading the board for your country

Pick a country from the picker. A Cold War world is the only place to play the Soviet Union or East Germany. Then read the opening board for it.

\`\`\`starting-state-dashboard
\`\`\`

## Choosing a start region for business

The seeded sector markets and specialties are what [corporations](/wiki/corporations) compete for. Regional sector specialties add a starting margin bonus on top of the market: **+5 percentage points** for a region's primary specialty and **+2.5 percentage points** for its secondary. The dashboard's Specialties section lists them by region.

\`\`\`sector-seed-map
\`\`\`

Examples of the shape of the seeded markets:

- California leans heavily to technology and lightly to extraction. West Virginia is the reverse.
- New York is strongest in financial services. Bavaria has a strong automobile seed.
- Tokyo and Kanto lean toward finance more than automobiles.
- China's northwest opens around energy and extraction, while the east and south lean toward technology and manufacturing.
- Brazil splits sharply: Norte favors extraction, Centro-Oeste favors agriculture, and Sudeste favors finance and manufacturing.

Seeded market sizes follow real GDP composition rather than an equal split, so a large technology market in California is large in absolute terms.

You found an extraction corporation in West Virginia, where extraction is the primary specialty. A sector there earns the region's +5 percentage points. If extraction is also your corporation's own primary type, the type match adds another +5, for +10 percentage points on top of the base margin before other modifiers. The same sector in a region with no extraction specialty gets only the +5 from your type. Check the dashboard before you commit capital.

## Default parties and empty legislatures

- **Default parties cannot be deleted.** They exist in every world and survive any treasury or membership. Player-founded parties can be dissolved if they lose all members.
- **Starting treasuries do not regenerate on their own.** Parties grow funds through player-paid dues, tax rates set by leadership, and events. A low-treasury party can still compete if players fund it.
- **Where a legislature starts empty,** the first elections fill it.

The opening board depends on the world's era preset and on which countries are open to players there, so check the country picker for the current world. Last checked 2026-10-29, version 1.18.0. Exact rules: [World and era systems (design)](https://docs.lakesidegames.net/design/world-and-era-systems-as-shipped.html)
`;
