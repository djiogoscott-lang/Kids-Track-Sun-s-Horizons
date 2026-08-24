import { beforeEach, describe, expect, it } from "vitest";
import { resetPresenceRecords, getPresenceRecords } from "@/server/demo/store";
import { markAbsent, markArrived, markLeft, markStillPresent } from "./commands";
import { PresenceCommandError } from "./errors";

beforeEach(() => {
  resetPresenceRecords();
});

// activity-baby-tennis seeds every child arrived and still present (see server/demo/store.ts)
const ARRIVED_CHILD = "child-38";
// activity-danse seeds the last two children as absent
const ABSENT_CHILD = "child-11";

describe("presence commands", () => {
  it("marks an absent child as arrived", () => {
    markArrived("activity-danse", ABSENT_CHILD);
    expect(getPresenceRecords().get(ABSENT_CHILD)?.arrived).toBe(true);
  });

  it("marks an arrived child back to absent", () => {
    markAbsent("activity-baby-tennis", ARRIVED_CHILD);
    const record = getPresenceRecords().get(ARRIVED_CHILD);
    expect(record?.arrived).toBe(false);
    expect(record?.arrivedAt).toBeNull();
  });

  it("clears a departure when a child is reset to absent", () => {
    markArrived("activity-danse", ABSENT_CHILD);
    markLeft("activity-danse", ABSENT_CHILD);
    markAbsent("activity-danse", ABSENT_CHILD);
    const record = getPresenceRecords().get(ABSENT_CHILD);
    expect(record?.left).toBe(false);
    expect(record?.leftAt).toBeNull();
  });

  it("refuses to mark a never-arrived child as having left", () => {
    expect(() => markLeft("activity-danse", ABSENT_CHILD)).toThrow(PresenceCommandError);
  });

  it("marks an arrived child as left", () => {
    markLeft("activity-baby-tennis", ARRIVED_CHILD);
    const record = getPresenceRecords().get(ARRIVED_CHILD);
    expect(record?.left).toBe(true);
    expect(record?.leftAt).not.toBeNull();
  });

  it("undoes a departure via markStillPresent", () => {
    markLeft("activity-baby-tennis", ARRIVED_CHILD);
    markStillPresent("activity-baby-tennis", ARRIVED_CHILD);
    const record = getPresenceRecords().get(ARRIVED_CHILD);
    expect(record?.left).toBe(false);
    expect(record?.leftAt).toBeNull();
  });

  it("refuses an action on a child from a different activity", () => {
    expect(() => markArrived("activity-multisport", ABSENT_CHILD)).toThrow(PresenceCommandError);
  });
});
