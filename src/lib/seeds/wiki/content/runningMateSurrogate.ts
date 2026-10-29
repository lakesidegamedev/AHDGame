export const runningMateSurrogateContent = `# Running Mate Surrogate Campaigning

A presidential nominee can only be in one state at a time. The running mate can be in another. If you are the player who owns the running-mate character, you can spend your own turn on the road as a surrogate, holding a battleground the nominee cannot reach that turn. The actions are for presidential general elections only. For selecting a running mate and the VP's standing bonuses, see [General Elections](/wiki/general-elections).

## The daily pool

Both surrogate actions draw from one shared pool of **2 surrogate actions per day**. It refills every day at **midnight Eastern Time**, and the cap stays fixed for the whole race. When the pool is empty, surrogate actions are blocked until the next reset. They also cost the running mate's **own** character actions on top of the pool, so a busy VP still has to budget their turn.

The surrogate acts on the presidential nominee's campaign, not their own (a running mate has no separate candidacy). The actions are for presidential general elections only.

### Visiting a state

Sending the running mate to a state sets where the ticket is campaigning. While they are there, the ticket gains **+1.0% favorability per turn** in that state, on top of the nominee's own travel presence bonus. Favorability feeds the vote engine, so it moves real votes and raises the ticket's totals in that state under [General Elections](/wiki/general-elections). The running mate is chosen after the primary and only acts in the general phase. The state must be in the ticket's own country.

### Canvassing for the ticket

Once the running mate is in a state, they can canvass there for the ticket, exactly as a candidate canvasses a home state (see [Canvassing](/wiki/canvassing)); the ticket canvass adds turnout in the state the running mate is visiting. It raises a voter group's turnout in that state, scaled by alignment, doubled in the final campaign window, with diminishing returns when the same group is canvassed repeatedly.

### Costs at a glance

| Item | Value |
| --- | --- |
| Shared surrogate pool | 2 per day |
| Pool refill | Midnight Eastern Time |
| State visit cost | 1 from the pool, plus 3 to 10 of the VP's own actions |
| State visit effect | +1.0% favorability per turn in that state |
| Canvass cost | 1 from the pool, plus 1 of the VP's own actions and ₳100 in campaign funds |

The VP's own action cost for travel depends on the state's electoral votes: 3 actions for 5 or fewer, 5 for up to 10, 7 for up to 20, 10 above that.

![A shared daily pool of two surrogate actions pays for state visits and canvasses, each with extra costs, and refills at midnight Eastern.](/wiki-images/diagrams/running-mate-surrogate-pool.svg)

### One day on the trail

On a given day the running mate has 2 pool actions and enough personal actions. They travel to a state with 16 electoral votes (7 of their own actions, 1 from the pool) and then canvass one group there (1 own action, 1 from the pool, ₳100). The pool is now empty and stays empty until midnight Eastern. The ticket is gaining 1.0% favorability a turn in that state and the canvassed group's turnout is up. The nominee is free to spend the day in a different state.

Why the cap exists: it stops a surrogate from replacing the nominee's own ground game, while still letting a well-used running mate hold a battleground the nominee cannot reach that turn.

## Who can do this

- **Only the player whose character is the running mate** can use the actions. Campaign managers do not get them, and tickets led by computer-run candidates (NPPs) have no player running mate, so they never generate them.
- **Visit a state** and then **canvass** from the nominee's campaign page while you are the running mate. Every other campaign control is in the [Campaign Manager](/wiki/campaign-manager).
- Plan the pool by day: one visit plus one canvass uses both actions, or two canvasses in the same state use both too.

Tips:

- Travel first to the state where favorability will compound over several turns, then canvass the group with the biggest turnout gap.
- Use your two daily actions even if you cannot afford a long trip. An unused pool does not carry over.

Live in US presidential general elections where the ticket has a player running mate. Unavailable during the primary and in all other races. Last checked 2026-10-29, version 1.18.0. Exact rules: [Elections (design)](https://docs.lakesidegames.net/design/elections.html). See also [Political Operations](/wiki/political-operations).
`;
