import { describe, expect, it } from "vitest";
import { getDayPhase } from "./day-phase";

// Europe/Brussels is UTC+1 (winter) or UTC+2 (summer); using explicit UTC
// offsets for winter (CET) keeps this test DST-proof.
describe("getDayPhase", () => {
  it("is the morning phase before 09:15", () => {
    expect(getDayPhase(new Date("2026-01-15T07:52:00.000Z")).id).toBe("morning"); // 08:52 CET
  });

  it("is the activities phase between 09:15 and 16:00", () => {
    expect(getDayPhase(new Date("2026-01-15T11:30:00.000Z")).id).toBe("activities"); // 12:30 CET
  });

  it("is the departures phase between 16:00 and 16:15", () => {
    expect(getDayPhase(new Date("2026-01-15T15:05:00.000Z")).id).toBe("departures"); // 16:05 CET
  });

  it("is the daycare phase from 16:15 onward", () => {
    expect(getDayPhase(new Date("2026-01-15T15:15:00.000Z")).id).toBe("daycare"); // 16:15 CET
  });
});
