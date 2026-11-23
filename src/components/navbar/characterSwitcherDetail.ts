/** One line of stats so same-named characters can be told apart in the switcher. */
export function characterSwitcherDetail(input: {
  officeLabel: string;
  nationalInfluence: number | undefined;
  actions: number | undefined;
}): string {
  const parts = [input.officeLabel];
  parts.push(`NI ${(input.nationalInfluence ?? 0).toFixed(1)}`);
  parts.push(`${Math.floor(input.actions ?? 0)} actions`);
  return parts.join(" · ");
}
