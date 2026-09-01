import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityRecord, ChildRecord } from "@/server/data-source";
import type { RosterImportRow } from "./commands";

/**
 * Who is "the same child" at import time.
 *
 * The NDC lists exposed the answer the hard way: two sisters are both
 * registered as "FAUVEL Clara" — one born 2020 in class 1D, one born 2022 in
 * 2M6. Matching on name alone folded them into a single child, and since a
 * child holds at most one weekly inscription, importing the second list moved
 * the first sister's inscription to the second sister's activity instead of
 * enrolling both. One child ended up in the wrong list and the other did not
 * exist at all.
 */

const ACTIVITIES: ActivityRecord[] = [
  { id: "act-prim", name: "Primaire NDC", description: "", monitorId: null, active: true },
  { id: "act-mat2", name: "Mat 2 NDC", description: "", monitorId: null, active: true },
  { id: "act-off", name: "Mat 1 NDC", description: "", monitorId: null, active: false },
];

let children: ChildRecord[] = [];
let roster: Array<{ childId: string; activityId: string }> = [];

vi.mock("@/server/data-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/data-source")>();
  return {
    ...actual,
    getChildrenList: async () => children,
    getActivitiesList: async () => ACTIVITIES,
    getRosterForWeek: async () => roster,
  };
});

// AI assist would reach for the network on unresolved rows; these tests are
// about the deterministic pass, so it is stubbed out entirely.
vi.mock("./ai-import-assist", () => ({
  suggestActivityMatch: async () => null,
  suggestNameSplit: async () => null,
}));

const { previewRosterImport } = await import("./commands");

function child(over: Partial<ChildRecord> & { id: string; firstName: string; lastName: string }): ChildRecord {
  return {
    activityId: "act-prim",
    daycareAuto: false,
    active: true,
    notes: "",
    isDemo: false,
    createdAt: new Date(0),
    birthDate: "",
    schoolClass: "",
    phone: "",
    email: "",
    ...over,
  };
}

function row(over: Partial<RosterImportRow> & { firstName: string; lastName: string; activityName: string }): RosterImportRow {
  return { row: 6, sheetName: "S", garderie: "Oui", notes: "", ...over };
}

const WEEK = "2026-08-31";

beforeEach(() => {
  children = [];
  roster = [];
});

describe("child identity during a roster import", () => {
  it("treats two same-named children with different birth dates as two children", async () => {
    children = [child({ id: "c1", firstName: "Clara", lastName: "FAUVEL", birthDate: "2020-03-23", activityId: "act-prim" })];

    const { outcomes } = await previewRosterImport(
      [row({ firstName: "Clara", lastName: "FAUVEL", activityName: "Mat 2 NDC", birthDate: "2022-03-09" })],
      WEEK,
      false,
    );

    expect(outcomes[0].status).toBe("NEW_CHILD");
    expect(outcomes[0].childId).toBeUndefined();
  });

  it("recognises the same child when the birth dates agree", async () => {
    children = [child({ id: "c1", firstName: "Clara", lastName: "FAUVEL", birthDate: "2020-03-23" })];

    const { outcomes } = await previewRosterImport(
      [row({ firstName: "Clara", lastName: "FAUVEL", activityName: "Primaire NDC", birthDate: "2020-03-23" })],
      WEEK,
      false,
    );

    expect(outcomes[0].status).toBe("KNOWN_CHILD");
    expect(outcomes[0].childId).toBe("c1");
  });

  it("still matches on name alone when the existing child predates the birth-date field", async () => {
    // Every child recorded before birth_date existed has none; adding the
    // field must not turn them all into strangers and duplicate them.
    children = [child({ id: "c1", firstName: "Lucas", lastName: "Martin", birthDate: "" })];

    const { outcomes } = await previewRosterImport(
      [row({ firstName: "Lucas", lastName: "Martin", activityName: "Primaire NDC", birthDate: "2019-05-04" })],
      WEEK,
      false,
    );

    expect(outcomes[0].status).toBe("KNOWN_CHILD");
    expect(outcomes[0].childId).toBe("c1");
  });

  it("still matches on name alone when the imported row has no birth date", async () => {
    children = [child({ id: "c1", firstName: "Lucas", lastName: "Martin", birthDate: "2019-05-04" })];

    const { outcomes } = await previewRosterImport(
      [row({ firstName: "Lucas", lastName: "Martin", activityName: "Primaire NDC" })],
      WEEK,
      false,
    );

    expect(outcomes[0].status).toBe("KNOWN_CHILD");
  });

  it("keeps two same-named sisters in the same file as two separate rows", async () => {
    const { outcomes, summary } = await previewRosterImport(
      [
        row({ row: 6, firstName: "Clara", lastName: "FAUVEL", activityName: "Primaire NDC", birthDate: "2020-03-23" }),
        row({ row: 7, firstName: "Clara", lastName: "FAUVEL", activityName: "Primaire NDC", birthDate: "2022-03-09" }),
      ],
      WEEK,
      false,
    );

    expect(outcomes.map((o) => o.status)).toEqual(["NEW_CHILD", "NEW_CHILD"]);
    expect(summary.duplicates).toBe(0);
  });

  it("still flags a genuine duplicate — same name, same birth date, twice in one file", async () => {
    const { outcomes, summary } = await previewRosterImport(
      [
        row({ row: 6, firstName: "Clara", lastName: "FAUVEL", activityName: "Primaire NDC", birthDate: "2020-03-23" }),
        row({ row: 7, firstName: "Clara", lastName: "FAUVEL", activityName: "Primaire NDC", birthDate: "2020-03-23" }),
      ],
      WEEK,
      false,
    );

    expect(outcomes.map((o) => o.status)).toEqual(["NEW_CHILD", "DUPLICATE"]);
    expect(summary.duplicates).toBe(1);
  });
});

describe("a deactivated activity is reported as such", () => {
  it("says the activity is deactivated instead of calling it unknown", async () => {
    const { outcomes } = await previewRosterImport([row({ firstName: "Artémis", lastName: "LAES", activityName: "Mat 1 NDC" })], WEEK, false);

    expect(outcomes[0].status).toBe("UNKNOWN_ACTIVITY");
    expect(outcomes[0].message).toContain("désactivée");
    expect(outcomes[0].message).toContain("Mat 1 NDC");
  });

  it("still calls a genuinely unknown activity unknown", async () => {
    const { outcomes } = await previewRosterImport([row({ firstName: "A", lastName: "B", activityName: "Poterie" })], WEEK, false);

    expect(outcomes[0].message).toContain("inconnue");
  });

  it("refuses an explicit override onto a deactivated activity", async () => {
    const { outcomes } = await previewRosterImport(
      [row({ firstName: "A", lastName: "B", activityName: "Primaire NDC", activityOverride: "act-off" })],
      WEEK,
      false,
    );

    expect(outcomes[0].status).toBe("UNKNOWN_ACTIVITY");
    expect(outcomes[0].message).toContain("désactivée");
  });
});
