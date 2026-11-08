/**
 * Sector-type dossier copy: a briefing per type naming the business and what moves its margin, plus proposed controls that are not built yet. Nothing here is persisted, read by the turn, or allowed to change a number. Live metrics are computed in `sectorTypeMetrics`.
 *
 * COPY RULE (project standing): plain language, short, no dashes.
 */

import type { OperatingSectorType } from "./corporations";

/**
 * What this business actually is, in two sentences.
 *
 * The point of the briefing is that a player who has never run a power station
 * should be able to read one and know what moves its margin. Every line names
 * the exposure, because that is the decision the sector asks of its owner.
 */
export const SECTOR_TYPE_BRIEFING: Record<OperatingSectorType, string> = {
  manufacturing:
    "Turns iron and coal into steel and building materials. Margins live and die on input prices, so a manufacturing corp fights for supply agreements as hard as for market share.",
  energy:
    "Sells power to every other sector in the state. Demand is nearly guaranteed, but the fuel mix decides exposure: coal and gas prices, or electronics for renewables.",
  extraction:
    "Pulls raw commodities out of a finite state deposit. Output depends on what is actually in the ground; deposits deplete, royalties are negotiated with the state.",
  retail:
    "Sells finished goods to households. The most demand sensitive type: consumer confidence, brand loyalty and advertising move revenue more than any input price.",
  financial:
    "Lends, underwrites and trades. Earns on the spread between deposits and the central bank rate, so rate decisions and credit conditions matter more than commodities.",
  media:
    "Sells advertising against an audience. Uniquely, a media sector also shapes opinion: editorial stance nudges approval for parties and politicians in the state.",
  technology:
    "Produces electronics and software and generates the corporation's R&D points. Talent constrained rather than material constrained; the tech tree is unlocked here.",
  agriculture:
    "Grows food on a seasonal cycle. Output swings with the harvest calendar and weather events; fertilizer and fuel are the exposure, subsidies the cushion.",
  healthcare:
    "Delivers care to the state population. Revenue tracks public health spending and insurance policy; a well run network lifts state health metrics, which voters notice.",
  defense:
    "Sells to governments, not markets. Revenue is contract backlog: procurement orders, delivery grades and export licences decide the year, not consumer demand.",
  logistics:
    "Moves everyone else's goods. Every depot adds freight capacity and network coverage. Depots never pay the sprawl penalty themselves, but they count toward the sector total that sets it for everything else.",
  chemical_industries:
    "Refines oil and energy into feedstocks everyone downstream needs: chemicals, plastics, fertilizers, drugs. Flexible output mix, but every line carries spill and regulatory risk.",
  manufacturing_vehicles:
    "Assembles vehicles from steel, electronics and plastics. A brand business as much as a factory one: model cycles, recalls and fuel prices move demand more than capacity.",
  real_estate:
    "Owns and leases property. Revenue is slow and sticky; the exposure is the central bank rate and the local construction market, and every development anchors a state's housing metric.",
  construction:
    "Builds for everyone else. Demand follows the state's development pipeline and public works budget; the exposure is steel and building-material prices and idle crews between contracts.",
  telecommunications:
    "Runs the network every digital sector rides on. Coverage is territorial: hubs compete for spectrum and right-of-way in each state, and outages hit approval fast.",
  media_entertainment:
    "Sells experiences: studios, venues and digital content. Revenue swings with release slates and consumer confidence, and a hit lifts the corp's brand across every other sector.",
};
