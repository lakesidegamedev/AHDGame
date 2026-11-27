import { expect, it } from "vitest";
import { senateAppointmentTermEnd } from "./senateAppointmentTerm";
import { MS_PER_TURN, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
it("uses the scheduled class election for a vacancy term", () => {
  expect(senateAppointmentTermEnd(1000, 2000)).toBe(2000);
});
it.each([undefined, Number.NaN, 900])(
  "uses six turn-based game years when the class election is unavailable: %s",
  (end) => {
    expect(senateAppointmentTermEnd(1000, end) - 1000).toBe(6 * TURNS_PER_YEAR * MS_PER_TURN);
    expect(senateAppointmentTermEnd(1000, end) - 1000).toBeLessThan(30 * 24 * 60 * 60 * 1000);
  }
);
