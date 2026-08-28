import { beforeEach, describe, expect, it } from "vitest";
import { resetPresenceRecords } from "@/server/demo/store";
import { closeActivityDay } from "./commands";
import { getActivityDetail } from "./queries";
import { PresenceCommandError } from "./errors";

beforeEach(async () => {
  await resetPresenceRecords();
});

describe("activity day closure", () => {
  it("closes an open activity and records who closed it", async () => {
    const before = await getActivityDetail("activity-danse");
    expect(before?.closed).toBe(false);

    await closeActivityDay("activity-danse", "monitor-1", "Moniteur 1");

    const after = await getActivityDetail("activity-danse");
    expect(after?.closed).toBe(true);
    expect(after?.closedAt).not.toBeNull();
  });

  it("refuses a second closure of the same activity", async () => {
    await closeActivityDay("activity-multisport", "monitor-2", "Moniteur 2");
    await expect(closeActivityDay("activity-multisport", "monitor-2", "Moniteur 2")).rejects.toThrow(PresenceCommandError);
  });

  it("moves an unpicked-up child into garderie once the activity is closed", async () => {
    // Fixed at 14:00 Brussels — well before the 16:15 daycare cutoff, so this
    // assertion is about closure, not about what time the test happens to run.
    const beforeCutoff = new Date("2026-01-15T13:00:00.000Z");

    // activity-velo seeds every child both arrived and left (see server/demo/store.ts),
    // so mark one back to "still present" first to have someone left to close over.
    const { markStillPresent } = await import("./commands");
    await markStillPresent("activity-velo", "child-29", "monitor-3", beforeCutoff);

    const beforeClose = await getActivityDetail("activity-velo", beforeCutoff);
    const child = beforeClose?.eveningList.find((c) => c.childId === "child-29");
    expect(child?.status).not.toBe("DAYCARE");

    await closeActivityDay("activity-velo", "monitor-3", "Moniteur 3", beforeCutoff);

    const afterClose = await getActivityDetail("activity-velo", beforeCutoff);
    const afterChild = afterClose?.eveningList.find((c) => c.childId === "child-29");
    expect(afterChild?.status).toBe("DAYCARE");
  });
});
