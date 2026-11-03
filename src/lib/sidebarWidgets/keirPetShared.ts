// Browser-safe pieces of the Keir pet widget: types and the heart thresholds.
// The server logic lives in keirPet.ts, which imports the database driver and
// must never be imported from a client component.

/** Bond needed for each heart, 1 to 5. */
export const BOND_LEVELS = [10, 30, 60, 100, 150];

/** Keir's reaction to a tip, played when the widget opens. */
export type AdviceTone = "warn" | "nudge" | "idea" | "chat";

export interface KeirAdvice {
  id: string;
  title: string;
  why: string;
  link: string | null;
  tone: AdviceTone;
  generatedAt: string;
}

export interface KeirPetWidgetData {
  advice: KeirAdvice;
  bond: number;
  hearts: number;
  /** Bond needed for the next heart; null at five hearts. */
  nextHeartAt: number | null;
  streak: number;
  teaReadyAt: string | null;
  patReadyAt: string | null;
}
