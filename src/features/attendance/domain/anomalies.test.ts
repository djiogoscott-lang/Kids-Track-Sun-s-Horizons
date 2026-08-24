import { describe, expect, it } from "vitest";
import { detectSessionAnomalies } from "./anomalies";
import type { AttendanceRecord } from "./types";

function record(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    sessionParticipantId: "sp-1",
    childId: "child-1",
    presenceState: "PRESENT",
    arrivalClassification: "ON_TIME",
    arrivedAt: "2026-09-16T13:31:00.000Z",
    leftAt: null,
    lastEventId: "evt-1",
    ...overrides,
  };
}

describe("detectSessionAnomalies", () => {
  const endedSession = { id: "s-1", endsAt: "2026-09-16T15:30:00.000Z", status: "ACTIVE" as const };
  const names = new Map([["sp-1", "Lucas Martin"]]);

  it("flags a child still present after the session has ended", () => {
    const anomalies = detectSessionAnomalies(endedSession, [record({})], new Date("2026-09-16T15:42:00.000Z"), names);
    expect(anomalies.some((a) => a.type === "CHILD_STILL_PRESENT")).toBe(true);
  });

  it("does not flag a child who already left", () => {
    const anomalies = detectSessionAnomalies(
      endedSession,
      [record({ presenceState: "LEFT", leftAt: "2026-09-16T15:19:00.000Z" })],
      new Date("2026-09-16T15:42:00.000Z"),
      names,
    );
    expect(anomalies.some((a) => a.type === "CHILD_STILL_PRESENT")).toBe(false);
  });

  it("does not flag anything before the session has ended", () => {
    const anomalies = detectSessionAnomalies(endedSession, [record({})], new Date("2026-09-16T14:00:00.000Z"), names);
    expect(anomalies).toHaveLength(0);
  });

  it("flags a session left open long past its end time", () => {
    const anomalies = detectSessionAnomalies(endedSession, [], new Date("2026-09-16T15:50:00.000Z"), names);
    expect(anomalies.some((a) => a.type === "SESSION_NOT_CLOSED")).toBe(true);
  });

  it("does not flag a closed session even if children were left present", () => {
    const closed = { ...endedSession, status: "CLOSED" as const };
    const anomalies = detectSessionAnomalies(closed, [record({})], new Date("2026-09-16T16:00:00.000Z"), names);
    expect(anomalies).toHaveLength(0);
  });
});
