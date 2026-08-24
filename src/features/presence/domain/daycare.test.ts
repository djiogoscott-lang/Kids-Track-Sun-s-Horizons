import { describe, expect, it } from "vitest";
import { eveningStatus, isPastDaycareCutoff } from "./daycare";
import type { PresenceRecord } from "./types";

function record(overrides: Partial<PresenceRecord>): PresenceRecord {
  return { childId: "c1", activityId: "a1", arrived: true, arrivedAt: new Date(), left: false, leftAt: null, ...overrides };
}

// Europe/Brussels is UTC+1 (winter) or UTC+2 (summer); using explicit offsets keeps this test DST-proof.
describe("isPastDaycareCutoff", () => {
  it("is false before 16:15 local time", () => {
    expect(isPastDaycareCutoff(new Date("2026-01-15T15:14:00.000Z"))).toBe(false); // 16:14 CET
  });

  it("is true at exactly 16:15 local time", () => {
    expect(isPastDaycareCutoff(new Date("2026-01-15T15:15:00.000Z"))).toBe(true); // 16:15 CET
  });

  it("is true well after 16:15 local time", () => {
    expect(isPastDaycareCutoff(new Date("2026-01-15T18:00:00.000Z"))).toBe(true);
  });
});

describe("eveningStatus", () => {
  const before = new Date("2026-01-15T14:00:00.000Z"); // 15:00 CET
  const after = new Date("2026-01-15T16:00:00.000Z"); // 17:00 CET

  it("is LEFT once a child has left, regardless of time", () => {
    expect(eveningStatus(record({ left: true }), after)).toBe("LEFT");
  });

  it("is STILL_PRESENT before the cutoff for a child who has not left", () => {
    expect(eveningStatus(record({ left: false }), before)).toBe("STILL_PRESENT");
  });

  it("is DAYCARE after the cutoff for a child who has not left", () => {
    expect(eveningStatus(record({ left: false }), after)).toBe("DAYCARE");
  });
});
