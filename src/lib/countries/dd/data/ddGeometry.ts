/**
 * East Berlin (`BEO`) geometry. The germany shard has no shape for `BEO`
 * (BE is West Berlin; Brandenburg carries Berlin as an interior enclave hole),
 * so this one-feature shard supplies the Berlin outline, lifted from
 * Brandenburg's interior ring to fill that hole exactly.
 */
export const DD_GEO_URL = "/dd-regions.json";

/** The codes this shard carries. */
export const DD_SHARD_CODES = ["BEO"] as const;

/** Compact on-map label — "Berlin (Ost)" overflows the small enclave tile. */
export const DD_LABEL_OVERRIDES: Record<string, string> = {
  BEO: "Berlin",
};
