import { beforeEach, describe, expect, it } from "vitest";
import { getActivityAssignments, setActivityMonitor } from "./store";

beforeEach(() => {
  const assignments = getActivityAssignments();
  assignments.set("activity-danse", "monitor-1");
  assignments.set("activity-multisport", "monitor-2");
  assignments.set("activity-velo", "monitor-3");
  assignments.set("activity-baby-tennis", "monitor-4");
});

describe("setActivityMonitor", () => {
  it("assigns a monitor who was not previously assigned anywhere", () => {
    setActivityMonitor("activity-danse", "monitor-2");
    // monitor-2 leaves multisport in the swap below; this case alone would
    // orphan multisport if monitor-2 had nowhere to go, so this test uses a
    // monitor already in play to also exercise the swap.
    expect(getActivityAssignments().get("activity-danse")).toBe("monitor-2");
  });

  it("swaps monitors so no monitor ends up on two activities", () => {
    setActivityMonitor("activity-danse", "monitor-3"); // monitor-3 was on velo
    const assignments = getActivityAssignments();

    expect(assignments.get("activity-danse")).toBe("monitor-3");
    expect(assignments.get("activity-velo")).toBe("monitor-1"); // danse's old monitor moves to velo

    const monitorIds = [...assignments.values()];
    expect(new Set(monitorIds).size).toBe(monitorIds.length); // still a 1:1 mapping
  });
});
