export const extractionContractsContent = `# Extraction Contracts

A crowded state squeezes everyone: when total demand beats what the ground can yield, every uncontracted sector gets a smaller share. An extraction contract is the way out. It reserves a named corporation's share of a state's [resource capacity](/wiki/resources-overview) in exchange for a signing fee and an ongoing royalty. Governments award new contracts through competitive bidding, so the question for a corporation is what the guarantee is worth against what you will pay for it.

| Rule | Value |
| --- | --- |
| Most capacity that can be reserved in one state and resource | 75% (at least a quarter stays open access) |
| Royalty rate | 0% to 2% |
| Contract term | 24 to 480 turns |
| Missed royalty payments before default | 3 total (counter resets after a paid royalty) |
| Bid | Signing fee, at or above the published minimum |
| Finder's rights contract after a successful corporate survey | 96 turns, no royalty |

![Lifecycle of an extraction contract from tender and sealed bids through award, signing fee and royalties to the capacity returning to the open pool, with cancellation before an award.](/wiki-images/diagrams/extraction-contracts-lifecycle.svg)

## Is a contract worth it?

- It pays off when the state's open pool is crowded, or when you want certainty for a long term.
- It costs the signing fee up front plus the royalty every turn. A contract does not guarantee buyers or sales.
- Pick a fee you can afford: if you cannot fund it after winning, the government can select another bid.
- If you do not bid, you still share the open-access pool in proportion to your extraction demand.

Say a state can yield 100,000 barrels of oil per turn. The government publishes a tender for a 40% share, 1% royalty, 96-turn term and a minimum signing fee of ₳1,000,000. Corporation A bids ₳1,500,000 and Corporation B bids ₳1,200,000. The bids become public when bidding closes. The official picks A with a public reason and A pays ₳1,500,000.

A now has 40,000 barrels per turn guaranteed. If A wants 55,000, the extra 15,000 competes for the open-access pool alongside other companies' demand. The other 60,000 barrels are open access: if B and a third company ask for 50,000 and 30,000, together 80,000 against a 60,000 pool, every company is scaled to 75%, giving B 37,500 and the other 22,500. Without the contract, A would compete for the whole 100,000 pool against 80,000 of other demand, so the guarantee matters most when open demand is heavy.

## Finding the tenders

Open **Government Contracts** from the World menu or a Cabinet Office's Government Contracts tab. Every country has its own board, with **Active Bidding**, **Bidding Closed**, **Awarded** and **Canceled** tabs. Filter by Extraction to see concessions.

An extraction corporation’s **Contracts** tab links to matching tenders even before it holds a contract. Active agreements show their capacity share, royalty, expiry and award record. Revoked, expired and defaulted agreements stay in history.

A region’s **Resources** tab shows daily capacity, daily output, contracted shares and remaining contract headroom. Open tenders reserve headroom without allocating production until award activation. National officials can revoke nationally issued concessions there; regional officials can revoke concessions issued by their region. The server checks the current office holder on every action.

## Placing a bid

A corporation must be an extraction corporation with operations in the tender's state. Only extraction corporations can hold contracts. Its CEO chooses a signing-fee bid at or above the published minimum. The share, royalty and term stay fixed, so companies compete on comparable terms.

Bid values are sealed until bidding closes. You can see your own corporation's current bid and revision history. You may revise or withdraw it before the closing turn. Once bidding closes, the current qualifying bids and their revision history become public.

Submitting a bid authorizes the concession to activate if the government selects it. There is no second acceptance step and no deposit merely for bidding. Keep enough corporate capital available to pay your promised signing fee; if you cannot, the award fails for you and the government can pick another bidder.

## If you are the government

A tender fixes the state, resource, capacity share, contract term, royalty rate and minimum signing fee. It also sets the bidding deadline and the award deadline. It does not select a corporation.

The offered share is reserved under the **75% cap** when the tender is published. Open tenders, outstanding award preparations and existing contracts all count toward that cap. Competing bids do not each reserve another share. The remaining resource capacity stays open access.

The Resource Extraction Authority Act determines who may publish and award:

- Federal licensing, including the default when no law exists: the national executive or finance minister.
- Concurrent licensing: qualifying national officials and regional executives.
- State licensing: the qualifying regional executive for that state.

Authority belongs to the office. A successor can manage an outstanding tender, and the current licensing law is checked when an official acts. Other Cabinet Offices can browse the board without gaining new contracting powers.

After bidding closes, an authorized official compares bids and selects a winner with a public reason. The list puts higher signing fees first, but the government chooses the winner.

## Award and payment

The winner is checked again. The signing fee moves from corporate capital to the issuing government in the appropriate currencies. National fees fund the national Treasury; regional fees credit the state's resource royalty revenue. If the state budget is missing, the national Treasury acts as custodian.

The contract becomes active only after its signing payment settles. Its term starts on activation. Interrupted awards stay in Bidding Closed for the government to resume; recovery does not charge the corporation again. If the corporation cannot fund the fee, the government can select another bid.

## Living with a concession

An active contract guarantees the corporation's allocated fraction of that state's resource capacity. A company with multiple concessions for the same resource in the same region receives their combined share across all its sectors. A contracted company's reserved share is a floor, not a ceiling: demand above that allocation competes for the open-access pool like any other company's. Without a contract, companies share the open-access pool in proportion to their extraction demand. A concession reserves extraction capacity, not buyers or sales.

Its royalty is charged each turn using current commodity prices. New concessions may specify a royalty from 0 to 2% and a term from 24 to 480 turns.

Three missed royalty payments default the contract; the counter resets after a paid royalty. Default or expiration ends the guaranteed allocation and returns the capacity to the open-access pool. The existing contract settlement and extraction-capacity rules continue to apply after a competitive award.

## Cancellation and history

Before an award, the government can cancel a tender with a public reason. An unawarded tender also expires when its award deadline arrives. Both appear in Canceled, and their capacity reservation is released.

After award, the issuing authority uses the existing contract revocation controls. The tender remains in Awarded as a record of the bidding decision, even if the resulting contract later expires, defaults or is revoked.

New direct offers to a chosen corporation are replaced by bidding. Existing active contracts keep their terms. Unanswered direct offers were withdrawn when bidding replaced them.

An extraction corporation with operations in the state is what a tender is aimed at; see [Corporations](/wiki/corporations). See also [Defence Procurement](/wiki/defence-procurement).

Contracts are awarded by bidding in worlds that run the extraction economy and the Government Contracts board. Existing contracts keep their terms. Last checked 2026-10-29, version 1.18.0. Exact rules: [Resources (design)](https://docs.lakesidegames.net/design/resources.html)
`;
