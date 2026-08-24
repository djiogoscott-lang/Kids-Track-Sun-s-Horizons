import { beforeEach, describe, expect, it } from "vitest";
import { resetDemoState, getDemoState } from "@/server/demo/store";
import { listSessionsForUser } from "./queries";
import { closeSession, correctDeparture, recordAbsence, recordArrival, recordDeparture } from "./commands";
import { AttendanceCommandError } from "./errors";

const actor = { name: "Test Monitor" };

beforeEach(() => {
  resetDemoState();
});

function firstParticipant(sessionId: string, presenceState: string) {
  const state = getDemoState();
  const participant = [...state.participants.values()].find((p) => p.sessionId === sessionId && p.presenceState === presenceState);
  if (!participant) throw new Error(`No participant with state ${presenceState} in ${sessionId}`);
  return participant;
}

describe("attendance commands", () => {
  it("lets an expected child arrive", () => {
    const participant = firstParticipant("session-multisports", "EXPECTED");
    const updated = recordArrival("session-multisports", participant.id, actor);
    expect(updated.presenceState).toBe("PRESENT");
    expect(updated.arrivedAt).not.toBeNull();
  });

  it("lets an absent child arrive afterwards", () => {
    const participant = firstParticipant("session-multisports", "ABSENT");
    const updated = recordArrival("session-multisports", participant.id, actor);
    expect(updated.presenceState).toBe("PRESENT");
  });

  it("refuses a departure without a prior arrival", () => {
    const participant = firstParticipant("session-multisports", "EXPECTED");
    expect(() => recordDeparture("session-multisports", participant.id, actor)).toThrow(AttendanceCommandError);
  });

  it("classifies a late arrival automatically based on the session threshold", () => {
    const state = getDemoState();
    const session = state.sessions.get("session-multisports")!;
    const participant = firstParticipant("session-multisports", "EXPECTED");
    const lateArrival = new Date(session.startsAt.getTime() + (session.lateAfterMinutes + 8) * 60_000);
    const updated = recordArrival("session-multisports", participant.id, actor, lateArrival);
    expect(updated.arrivalClassification).toBe("LATE");
  });

  it("creates a traceable correction event without discarding the prior value", () => {
    const participant = firstParticipant("session-baby-tennis", "LEFT");
    const originalLeftAt = participant.leftAt!;
    const correctedTime = new Date(originalLeftAt.getTime() + 15 * 60_000);

    correctDeparture("session-baby-tennis", participant.id, correctedTime, "Erreur de saisie", actor);

    const state = getDemoState();
    const events = state.eventsBySession.get("session-baby-tennis") ?? [];
    const correction = events.find((e) => e.eventType === "CORRECTION" && e.sessionParticipantId === participant.id);

    expect(correction).toBeDefined();
    expect(correction?.previousValue).toEqual({ leftAt: originalLeftAt.toISOString() });
    expect(correction?.newValue).toEqual({ leftAt: correctedTime.toISOString() });
    expect(state.participants.get(participant.id)?.leftAt).toEqual(correctedTime);
  });

  it("allows corrections on a closed session without reopening it as active", () => {
    const participant = firstParticipant("session-badminton", "LEFT");
    const corrected = correctDeparture(
      "session-badminton",
      participant.id,
      new Date(participant.leftAt!.getTime() + 5 * 60_000),
      "Ajustement",
      actor,
    );
    expect(corrected.leftAt).not.toEqual(participant.leftAt);
    expect(getDemoState().sessions.get("session-badminton")?.status).toBe("CLOSED");
  });

  it("refuses treating a closed session as an active one", () => {
    const participant = firstParticipant("session-badminton", "ABSENT");
    expect(() => recordArrival("session-badminton", participant.id, actor)).toThrow(AttendanceCommandError);
  });

  it("blocks closing a session with children still present unless forced", () => {
    const result = closeSession("session-multisports", actor);
    expect(result.closed).toBe(false);
    expect(result.stillPresentCount).toBeGreaterThan(0);
    expect(getDemoState().sessions.get("session-multisports")?.status).not.toBe("CLOSED");
  });

  it("closes a session once forced, recording who closed it", () => {
    const result = closeSession("session-multisports", actor, { force: true });
    expect(result.closed).toBe(true);
    expect(getDemoState().sessions.get("session-multisports")?.status).toBe("CLOSED");
    expect(getDemoState().sessions.get("session-multisports")?.closedBy).toBe(actor.name);
  });

  it("scopes a monitor's session list to sessions they are assigned to", () => {
    const karim = { id: "user-monitor-2", name: "Karim El Amrani", role: "MONITOR" as const };
    const sessions = listSessionsForUser(karim);
    expect(sessions.every((s) => ["Badminton 7+ ans", "Escalade 8–12 ans", "Mini-Tennis 4–6 ans", "Parkour 9–14 ans"].includes(s.groupName))).toBe(true);
    expect(sessions.some((s) => s.groupName === "Multisports 6–10 ans")).toBe(false);
  });

  it("gives an admin visibility into every session", () => {
    const admin = { id: "user-admin", name: "Jean Dupont", role: "ADMIN" as const };
    const sessions = listSessionsForUser(admin);
    expect(sessions).toHaveLength(8);
  });

  it("marks an absence and allows the same child to arrive later", () => {
    const participant = firstParticipant("session-multisports", "EXPECTED");
    const absent = recordAbsence("session-multisports", participant.id, actor);
    expect(absent.presenceState).toBe("ABSENT");

    const updated = recordArrival("session-multisports", participant.id, actor);
    expect(updated.presenceState).toBe("PRESENT");
  });
});
