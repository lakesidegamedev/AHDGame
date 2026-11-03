import { useCallback, useState } from "react";

// Answer length, the same Concise / Standard choice the Ask site offers. Ask
// reads `length` on the request; anything it does not know means Standard.

export const LENGTHS = [
  { id: "standard", label: "Standard", hint: "Two or three short paragraphs" },
  { id: "concise", label: "Concise", hint: "At most three short sentences" },
] as const;
export type LengthId = (typeof LENGTHS)[number]["id"];

export const LENGTH_KEY = "ahd-ask-drawer-length";

export function parseLength(value: unknown): LengthId {
  return LENGTHS.some((l) => l.id === value) ? (value as LengthId) : "standard";
}

function readLength(): LengthId {
  try {
    return parseLength(localStorage.getItem(LENGTH_KEY));
  } catch {
    return "standard";
  }
}

/** The chosen length, remembered across visits. */
export function useAskLength(): [LengthId, (next: LengthId) => void] {
  const [length, setLength] = useState<LengthId>(readLength);
  const choose = useCallback((next: LengthId) => {
    setLength(next);
    try {
      localStorage.setItem(LENGTH_KEY, next);
    } catch {
      // The choice only lasts this visit.
    }
  }, []);
  return [length, choose];
}

export function AskLengthSelect({
  value,
  onChange,
}: {
  value: LengthId;
  onChange: (next: LengthId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseLength(e.target.value))}
      aria-label="Answer length"
      title={LENGTHS.find((l) => l.id === value)?.hint}
      className="rounded-md border border-card-border bg-background px-1.5 py-0.5 text-base text-foreground focus:outline-none sm:text-[11px]"
    >
      {LENGTHS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
