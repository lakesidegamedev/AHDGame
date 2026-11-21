const typeMatch =
  "Affects productivity and the policy adjustment under plants. State-owned corporations are exempt";

const replacements = [
  [
    "Margin modifiers (type match, location, state conditions, size) turn revenue into profit.",
    "Realized sales less operating costs, including inputs and wages, give operating profit.",
  ],
  [
    "| Primary / secondary / unrelated sector margin | +5 / +2.5 / -15 percentage points |",
    "| Primary / secondary / unrelated type factors | +5 / +2.5 / -15 (state-owned corps exempt) |",
  ],
  [
    "then the effective margin applies every modifier below",
    "then input bills, wages and other operating costs are deducted",
  ],
  [
    "Sectors matching your primary type receive a +5 percentage-point operating margin bonus. You can later add a **secondary type** for a +2.5 percentage-point bonus on sectors of that type. A sector that matches neither type takes a **-15 percentage-point mismatch penalty**, so the type choice is a real constraint on where you build.",
    "You can add a **secondary type**. Under plants type match affects productivity and the policy adjustment. State-owned corporations are exempt.",
  ],
  [
    "Off-type sectors lose 15 margin points.",
    "Under plants, off-type sectors face a productivity and policy penalty.",
  ],
  [
    "the margin bonus; they do not gate which plants you can found.",
    "productivity and the policy adjustment under plants.",
  ],
  [
    "| Operating profit | Realized revenue minus total operating cost |",
    "| Operating profit | Realized sales minus operating costs, including actual inputs and wages |",
  ],
  [
    "| Effective margin | Capped display output derived from the realized profit basis |",
    "| Effective margin | Plant operating profit divided by realized sales. It can fall below -100% |",
  ],
  [
    "| Net profit | The plants P&L result after revenue and all recorded costs |",
    "| Net profit | Booked site income less site costs, including upkeep and compliance. Site net margin divides this by site revenue and is N/A when site revenue is zero |",
  ],
  [
    "If your output clears at a price premium, realized revenue is above nameplate and your profit is higher than nameplate x margin.",
    "A price premium raises revenue per unit sold. Total revenue also depends on units sold.",
  ],
  [
    "Commodity prices reach your bottom line by two separate routes. They move your **effective margin** through the commodity modifier, and they move your **realized revenue** through price realization. That is why changing a commodity price does not move your margin alone.",
    "Under plants, commodity prices change actual input costs and output revenue. The commodity modifiers below are legacy.",
  ],
  [
    "Many factors adjust your sector profit margins. These are additive:",
    "The legacy model adds these modifiers to the base margin. Under plants, policy factors feed a combined, capped adjustment tied to realized sales. Actual margin shifts depend on sales and costs.",
  ],
  [
    "+5pp primary / +2.5pp secondary / -15pp unrelated",
    "+5 primary / +2.5 secondary / -15 unrelated",
  ],
  [
    "Based on the corporation's chosen primary and secondary types. Other types take the penalty.",
    typeMatch,
  ],
  ["Bonus if sector matches primary type; penalty if neither type matches", typeMatch],
  [
    "| Secondary type match | +2.5pp | If sector matches secondary type |",
    "| Secondary type match | +2.5 | Factor for a sector matching the secondary type |",
  ],
  ["| Commodity input costs | ±50pp", "| Commodity input costs | Legacy: ±50pp"],
  ["| Commodity output demand | ±50pp", "| Commodity output demand | Legacy: ±50pp"],
  [
    "Logarithmic; shortages in inputs you consume compress margins",
    "Under plants, actual input bills apply",
  ],
  [
    "Inputs and outputs together cannot take more than 15pp",
    "In the legacy model, inputs and outputs together cannot take more than 15pp",
  ],
  [
    "Logarithmic; shortages in commodities you sell boost margins |",
    "Under plants, output prices and units sold determine revenue |",
  ],
  [
    "Sectors that don't match your primary or secondary type receive a **-15% penalty**.",
    "Under plants, off-type sectors face productivity and policy penalties. State-owned corporations are exempt.",
  ],
  [
    "Each strategy also weights how much local conditions such as grid reliability, broadband or workforce skill move its margin, capped at 8 points in total.",
    "Strategies weight grid reliability, broadband and workforce skill. The legacy 8-point cap applies to the factor feeding the policy adjustment under plants.",
  ],
] as const;

export function correctCorporationsMargins(content: string): string {
  for (const [before, after] of replacements) content = content.replaceAll(before, after);
  return content;
}

export function renderCorporationsContent([content]: TemplateStringsArray): string {
  return correctCorporationsMargins(content);
}
