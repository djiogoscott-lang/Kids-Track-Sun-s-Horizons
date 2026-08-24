import { describe, expect, it } from "vitest";
import { daycareReason, eveningStatus, isPastDaycareCutoff } from "./daycare";
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
    expect(eveningStatus(record({ left: true }), false, after)).toBe("LEFT");
  });

  it("is STILL_PRESENT before the cutoff for an open, unclosed activity", () => {
    expect(eveningStatus(record({ left: false }), false, before)).toBe("STILL_PRESENT");
  });

  it("is DAYCARE after the cutoff for a child who has not left", () => {
    expect(eveningStatus(record({ left: false }), false, after)).toBe("DAYCARE");
  });

  it("is DAYCARE once the activity is closed, even before the cutoff", () => {
    expect(eveningStatus(record({ left: false }), true, before)).toBe("DAYCARE");
  });
});

describe("daycareReason", () => {
  const before = new Date("2026-01-15T14:00:00.000Z"); // 15:00 CET
  const after = new Date("2026-01-15T16:00:00.000Z"); // 17:00 CET

  it("is null for a child who has not arrived", () => {
    expect(daycareReason(record({ arrived: false }), false, false, after)).toBeNull();
  });

  it("is null once a child has left", () => {
    expect(daycareReason(record({ left: true }), false, false, after)).toBeNull();
  });

  it("is PLANNED for a daycare-registered child as soon as they arrive, before the cutoff and before closure", () => {
    expect(daycareReason(record({}), true, false, before)).toBe("PLANNED");
  });

  it("is null for a non-daycare child before the cutoff on an open activity", () => {
    expect(daycareReason(record({}), false, false, before)).toBeNull();
  });

  it("is AFTER_SESSION for a non-daycare child once the activity is closed", () => {
    expect(daycareReason(record({}), false, true, before)).toBe("AFTER_SESSION");
  });

  it("is AFTER_SESSION for a non-daycare child once past the cutoff, even if not explicitly closed", () => {
    expect(daycareReason(record({}), false, false, after)).toBe("AFTER_SESSION");
  });
});
