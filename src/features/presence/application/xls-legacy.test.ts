import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { ImportFileError, loadWorkbook } from "./excel-import";
import { isLegacyXls } from "./xls-legacy";
import { autoColumnMapping, detectHeaderRow, isColumnMappingComplete, parseSheetRowsWithMapping } from "./roster-import";

/**
 * These fixtures reproduce the exact shape of the school's real workbooks
 * ("Liste N°4 Prim NDC.xls" and siblings) without carrying any real child's
 * data: a merged title on row 1, a stray date on row 2, two blank rows, the
 * headers on row 5, "X" marks for daycare, a single "Nom & prenom" column,
 * and a pile of empty leftover sheets. The real files themselves are never
 * committed — they hold names, birth dates, phone numbers and e-mails.
 */

const REAL_HEADERS = [
  "N°",
  "Nom & prenom",
  "Classe",
  "Date de Naissance",
  "Garderie 12H30 à 14h",
  "Sport & jeux 14h - 16h",
  "Garderie         16h00",
  "Tel",
  "Email",
  "T1",
  "payé",
  "T2",
  "payé",
  "T3",
  "payé",
];

const REAL_ROWS = [
  ["101", "MUSUNGAYI Mika Mathias", " 3B", new Date(Date.UTC(2018, 1, 3)), "X", "X", "", "0485/ 02 26 73", "a@b.be", " 200 € "],
  ["1", "PAIS CUSTODIO Mila", "1", new Date(Date.UTC(2020, 10, 23)), "X", "", "", "", "", " 50 € "],
  ["12", "GARRIDO ROUSSELOT Sasha", "1", new Date(Date.UTC(2020, 9, 7)), "X", "X", "X", "0470/ 85 52 17", "c@d.com", " 255 € "],
  ["6", "DE WALQUE Valentina", "1A", new Date(Date.UTC(2020, 5, 18)), "", "", "", "0471/ 31 60 88", "e@f.com", " 255 € "],
];

interface FixtureOptions {
  sheetName?: string;
  extraEmptySheets?: number;
  bookType?: XLSX.BookType;
  headers?: string[];
  rows?: unknown[][];
}

function buildRealShapedWorkbook(options: FixtureOptions = {}): Buffer {
  const { sheetName = "liste n° 4 Prim NDC", extraEmptySheets = 3, bookType = "xls", headers = REAL_HEADERS, rows = REAL_ROWS } = options;

  const aoa: unknown[][] = [
    ["NDC/LISTE GENERALE MERCREDI 2026-2027"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", new Date(Date.UTC(2026, 7, 24))],
    [],
    [],
    headers,
    ...rows,
    [], // trailing spacing rows, exactly like the real files
    ["", "", "", "", "", "", "", "", " "],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }];
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  for (let i = 0; i < extraEmptySheets; i++) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), `Feuil${i + 5}`);
  }

  const out = XLSX.write(wb, { type: "buffer", bookType });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/** Parses a workbook the way the preview route does, end to end. */
function parseLikeTheRoute(workbook: ExcelJS.Workbook, targetActivityName: string) {
  const populated = workbook.worksheets.filter((s) => s.actualRowCount > 0);
  const sheet = populated[0];
  const header = detectHeaderRow(sheet);
  const mapping = autoColumnMapping(header.headers);
  return {
    populated,
    sheet,
    header,
    mapping,
    complete: isColumnMappingComplete(header.headers, mapping, true),
    rows: parseSheetRowsWithMapping(sheet, mapping, { targetActivityName, headerRowNumber: header.rowNumber }),
  };
}

describe("isLegacyXls", () => {
  it("recognises the OLE2 signature and nothing else", () => {
    expect(isLegacyXls(buildRealShapedWorkbook({ bookType: "xls" }))).toBe(true);
    expect(isLegacyXls(buildRealShapedWorkbook({ bookType: "xlsx" }))).toBe(false);
    expect(isLegacyXls(Buffer.from("not a spreadsheet"))).toBe(false);
    expect(isLegacyXls(Buffer.alloc(0))).toBe(false);
  });
});

describe("loadWorkbook — legacy .xls", () => {
  it("reads a real-shaped BIFF8 workbook that exceljs alone cannot open", async () => {
    const buffer = buildRealShapedWorkbook();

    // Establish the gap is real: exceljs rejects BIFF8 outright.
    const raw = new ExcelJS.Workbook();
    await expect(raw.xlsx.load(buffer as unknown as Parameters<typeof raw.xlsx.load>[0])).rejects.toThrow();

    const workbook = await loadWorkbook("Liste N°4 Prim NDC.xls", buffer);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
    expect(workbook.worksheets[0].name).toBe("liste n° 4 Prim NDC");
  });

  it("still reads .xlsx — the new path must not displace the old one", async () => {
    const workbook = await loadWorkbook("liste.xlsx", buildRealShapedWorkbook({ bookType: "xlsx" }));
    const { rows, header } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(header.rowNumber).toBe(5);
    expect(rows).toHaveLength(REAL_ROWS.length);
  });

  it("rejects a file whose extension is neither .xls nor .xlsx", async () => {
    await expect(loadWorkbook("liste.csv", buildRealShapedWorkbook())).rejects.toThrow(ImportFileError);
  });

  it("reports a corrupt .xls as unreadable instead of crashing", async () => {
    // OLE2 signature, then garbage: passes the format sniff, fails the parse.
    const corrupt = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(2048, 0x41)]);
    await expect(loadWorkbook("liste.xls", corrupt)).rejects.toThrow(ImportFileError);
  });

  it("rejects an empty file as unreadable", async () => {
    await expect(loadWorkbook("liste.xls", Buffer.alloc(0))).rejects.toThrow(ImportFileError);
  });
});

describe("the school's real workbook shape, read from .xls", () => {
  it("finds the headers on row 5, under the merged title banner", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { header, complete } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(header.rowNumber).toBe(5);
    expect(complete).toBe(true);
  });

  it("maps the real headers and ignores the columns KidsTrack does not use", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { header } = parseLikeTheRoute(workbook, "Prim NDC");
    const byText = Object.fromEntries(header.headers.map((h) => [h.text.replace(/\s+/g, " ").trim(), h.autoField]));

    expect(byText["Nom & prenom"]).toBe("fullName");
    expect(byText["Classe"]).toBe("schoolClass");
    expect(byText["Date de Naissance"]).toBe("birthDate");
    expect(byText["Garderie 12H30 à 14h"]).toBe("daycareAuto");
    expect(byText["Garderie 16h00"]).toBe("daycareAuto");
    expect(byText["Tel"]).toBe("phone");
    expect(byText["Email"]).toBe("email");

    // Unknown columns are ignored, never fatal.
    expect(byText["N°"]).toBeNull();
    expect(byText["Sport & jeux 14h - 16h"]).toBeNull();
    expect(byText["T1"]).toBeNull();
    expect(byText["payé"]).toBeNull();
  });

  it("splits 'Nom & prenom' on the capitalised surname, including multi-word ones", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows.map((r) => [r.lastName, r.firstName])).toEqual([
      ["MUSUNGAYI", "Mika Mathias"],
      ["PAIS CUSTODIO", "Mila"],
      ["GARRIDO ROUSSELOT", "Sasha"],
      ["DE WALQUE", "Valentina"],
    ]);
  });

  it("reads birth dates as real dates, without shifting them across a timezone", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows.map((r) => r.birthDate)).toEqual(["2018-02-03", "2020-11-23", "2020-10-07", "2020-06-18"]);
  });

  it("treats an X in either garderie slot as daycare, and neither as none", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows.map((r) => r.garderie)).toEqual(["Oui", "Oui", "Oui", "Non"]);
  });

  it("keeps class, phone and e-mail verbatim", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows[0].schoolClass).toBe("3B"); // leading space in the file, trimmed
    expect(rows[0].phone).toBe("0485/ 02 26 73");
    expect(rows[2].email).toBe("c@d.com");
  });

  it("assigns every row to the chosen target activity", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Primaire NDC");
    expect(new Set(rows.map((r) => r.activityName))).toEqual(new Set(["Primaire NDC"]));
  });

  it("skips the trailing spacing rows instead of reporting them as errors", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook());
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows).toHaveLength(REAL_ROWS.length);
  });

  it("offers only the sheets that hold data, not the dozen empty leftovers", async () => {
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook({ extraEmptySheets: 12 }));
    expect(workbook.worksheets.length).toBe(13);
    const { populated } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(populated.map((s) => s.name)).toEqual(["liste n° 4 Prim NDC"]);
  });

  it("handles reordered columns, because mapping is by header text not position", async () => {
    const reordered = ["Email", "Nom & prenom", "Garderie 12H30 à 14h", "Date de Naissance", "Classe", "Tel"];
    const workbook = await loadWorkbook(
      "liste.xls",
      buildRealShapedWorkbook({
        headers: reordered,
        rows: [["z@z.com", "DUBOIS Ana", "X", new Date(Date.UTC(2019, 2, 15)), "2C", "0400"]],
      }),
    );
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows[0]).toMatchObject({
      lastName: "DUBOIS",
      firstName: "Ana",
      email: "z@z.com",
      schoolClass: "2C",
      birthDate: "2019-03-15",
      garderie: "Oui",
    });
  });

  it("imports a 150-child list in one pass", async () => {
    const many = Array.from({ length: 150 }, (_, i) => [
      String(i + 1),
      `NOM${i} Prenom${i}`,
      "3A",
      new Date(Date.UTC(2019, 0, 1 + (i % 28))),
      i % 2 === 0 ? "X" : "",
      "",
      "",
      "",
      "",
    ]);
    const workbook = await loadWorkbook("liste.xls", buildRealShapedWorkbook({ rows: many }));
    const { rows } = parseLikeTheRoute(workbook, "Prim NDC");
    expect(rows).toHaveLength(150);
    expect(rows.filter((r) => r.garderie === "Oui")).toHaveLength(75);
  });
});

describe("a surname typed with a stray lowercase run", () => {
  it("does not invert 'CAMPOLEoni Guido' into first CAMPOLEoni / last Guido", async () => {
    // Real row from the NDC primary list. The all-caps test used to fail on
    // this token, so the splitter fell back to "last token is the surname"
    // and the child was registered back to front.
    const workbook = await loadWorkbook(
      "liste.xls",
      buildRealShapedWorkbook({ rows: [["7", "CAMPOLEoni Guido", "2A", new Date(Date.UTC(2019, 7, 5)), "X", "", "", "", ""]] }),
    );
    const { rows } = parseLikeTheRoute(workbook, "Primaire NDC");
    expect(rows[0]).toMatchObject({ lastName: "CAMPOLEoni", firstName: "Guido" });
  });

  it("still treats an ordinary given name as a given name", async () => {
    const workbook = await loadWorkbook(
      "liste.xls",
      buildRealShapedWorkbook({ rows: [["1", "Gabriella Verstraete", "1A", new Date(Date.UTC(2020, 0, 1)), "", "", "", "", ""]] }),
    );
    const { rows } = parseLikeTheRoute(workbook, "Primaire NDC");
    expect(rows[0]).toMatchObject({ lastName: "Verstraete", firstName: "Gabriella" });
  });
});
