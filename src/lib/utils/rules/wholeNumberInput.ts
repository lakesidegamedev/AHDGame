/** Parse the complete quantity without deleting punctuation or changing the request to fit a cap. */
export function wholeNumberInput(
  raw: string,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number | null {
  const entered = raw.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(entered)) return null;
  const value = Number(entered.replaceAll(",", ""));
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
