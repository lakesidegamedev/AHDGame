export const blockadesContent = `# Blockades

## In short

A blockade is hulls in the water stopping trade that both parties still want. It is not an embargo, which is a political trade ban. You establish one by stationing naval formations on the sea approaches of a country you are at war with and holding them on the Blockade or Sea Denial posture. Closure is recomputed every turn from where your ships are, raises the target's trade costs continuously, and only closes trade outright under overwhelming force. It ends when the ships leave, are worn down or are driven off.

## Key numbers

| What | Value |
| --- | --- |
| Weight toward closing a lane | Blockade 1.0, Sea Denial 0.7, Sea Control 0.55, Escort 0.15, Transit and Port 0 |
| Port defence of an approach | The region's port rating (0 to 9) times 7 |
| Closure on one approach | Pressure divided by (pressure plus port defence) |
| Total closure | Pressure at 9 times port defence or more |
| Trade multiplier | 1 minus closure, never below 0.10, and 0 at total closure |
| Timing | Recomputed every turn from current positions, so it bites on arrival and stops when ships leave |
| Condition penalty | Weight falls with damage, and faster under 50% condition |
| War approval penalty | Starts when fleet condition drops under 70 |

### A worked example

A country's worst approach is the Mediterranean, which has a port rating of 8, so its port defence is 8 × 7 = 56. A hostile fleet on Blockade and Sea Denial, in good condition, adds up to a pressure of 56. Closure is 56 / (56 + 56) = 0.5, so trade into and out of the country runs at 50% of its normal affinity. With a pressure of 140, closure is 140 / 196 = 0.71 and trade runs at 29%. Once pressure reaches 9 × 56 = 504, closure is total and the country's seaborne supply is unreachable. In the South Atlantic, with a port rating of 3 and a defence of 21, a pressure of 189 gives total closure, so a lightly defended lane is much cheaper to shut.

## What you need

- **A war.** Only formations belonging to a country the target is at war with count. A neutral fleet parked on someone's coast closes nothing.
- **The right water.** A country's trade passes through its home region (if it touches water) plus every navigable region next to it. Those are its **approaches**. Your ships must be stationed in one of them.
- **The right posture.** Only Blockade and Sea Denial apply real pressure. Sea Control adds about half a hull's weight, Escort a sliver, Transit and Port nothing. A carrier flying an air mission applies none.
- **Sound, supplied hulls.** Pressure falls with damage, and much faster below 50 percent condition. Formations far from home, on a hostile coast, or crowded past the port's berths run low on supply and blockade at reduced weight.

## How closure is measured

Each turn the game works out a **closure** figure from 0 to 1 for every country with a hostile navy nearby:

1. For each approach, sum the lane pressure of hostile formations stationed there.
2. Set that against the approach's **port defence**, which scales with the port rating of the region. Big developed harbours are much harder to close than an anchorage.
3. Closure on that approach rises with pressure over pressure plus defence. It snaps to total closure only when pressure reaches nine times the port defence.
4. The country's closure is the **worst single approach**, not the sum. Closing one of three routes into a country does not close the country; a blockade bites when it shuts the way in that matters.

## What it does to the target

Blockade closure feeds the trade engine directly:

- Every trade flow into or out of the blockaded country has its trade affinity multiplied by one minus closure, floored at 10 percent. A partial blockade makes goods cost more to move and shifts buyers and sellers elsewhere.
- At total closure the multiplier is zero and the flow is treated exactly as an embargoed lane: the country's seaborne supply becomes unreachable.
- A blockade on **either** end of a flow counts. Goods have to leave one coast and arrive at another, and shutting either does it. The heavier closure of the two applies.

Blockade closure is recomputed from current fleet positions during the commodity price step each turn, so a fleet that arrives this turn bites this turn.

Separately, a carrier on station in water touching an enemy land front, combined with your sea control there, cuts that front's supply. That interdiction is capped and escorts and submarines cannot do it on their own; see [Naval Vessel Classes](/wiki/naval-vessel-classes).

## What it costs you

The Blockade posture is the most expensive to hold in readiness and has the highest signature, so a blockading fleet is the easiest thing at sea to find and strike from the air. Any hostile fleet entering the region on an aggressive posture forces a surface action whether you wanted one or not, and losses show up in war approval once fleet condition falls below 70.

## How a blockade ends

There is no blockade object to cancel. It exists only while the pressure does, so it ends when:

- the blockading formations change posture, move station or return to port;
- the war ends, since only hostile hulls count;
- the fleet is worn below the point where its pressure matters, through combat or damage;
- the defender breaks it, by driving the fleet off in a surface action, striking it from the air, or bringing enough friendly weight into the region to contest sea control.

Because closure follows the ships' positions turn by turn, a blockade is a commitment of ships and readiness, not a switch.

## Where to find it in game

Order postures and stations from **Naval and air command** on the country page, which the defence seat holder reaches from the Commands tab of the defence cabinet office. The effect shows up in trade flows and commodity prices for the blockaded country.

## What you can do

- **Blockader (the defence seat holder at war):** station naval formations in the target's approach regions on the Blockade or Sea Denial posture. In **Naval and air command**.
- **Defender:** drive the fleet off in a surface action, strike it from the air, or bring friendly weight into the region to contest sea control.
- **Everyone else:** watch trade flows and commodity prices for the blockaded country.

Common questions: *How do I blockade a country?* Be at war with it, then station ships on Blockade in one of its approach regions. *Why is my blockade not closing trade?* The target's port defence is higher than your pressure, your fleet is damaged, or it is on the wrong posture. *How do I break one?* See the list above. *Is a blockade the same as an embargo?* No. An embargo is a political trade ban. If both apply, an embargo blocks the lane outright, and a blockade multiplies whatever affinity is left, after tariffs.

## Connections

**Driven by**

- [Naval Vessel Classes & Standing Orders](/wiki/naval-vessel-classes): the hulls, postures and berths that create lane pressure.
- [Declaring War](/wiki/declaring-war): only hulls belonging to a country at war with the target count.

**Affects**

- [Trade System](/wiki/trade-system): closure multiplies the trade affinity of every flow into or out of the country.
- [Embargo & Trade Exposure](/wiki/embargo-and-trade-exposure): the two stack, since an embargo blocks a lane outright and a blockade scales whatever affinity is left.
- [Government Approval](/wiki/government-approval): losses at sea cut war approval once fleet condition is under 70.

## Status

Blockades work in every world and era where a navy exists and there is a war. Scotland and Wales have no defence seat and so no navy.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact closure rules have no design page of their own yet. The system is summarised on [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html).

## Related pages

- [Naval Vessel Classes & Standing Orders](/wiki/naval-vessel-classes): hulls, postures, sea control
- [Embargo & Trade Exposure](/wiki/embargo-and-trade-exposure): the political route to the same effect
- [Trade System](/wiki/trade-system): how affinity shapes flows
`;
