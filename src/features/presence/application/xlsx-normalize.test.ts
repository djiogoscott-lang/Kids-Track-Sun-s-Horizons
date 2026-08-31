import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { normalizePrefixedXlsx } from "./xlsx-normalize";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * Builds the exact shape that broke a real user import: every SpreadsheetML
 * part namespace-prefixed (<x:workbook>) and every relationship target
 * package-absolute ("/xl/…"). Both are valid OOXML that Excel never emits,
 * so exceljs cannot read either — see xlsx-normalize.ts.
 */
async function buildPrefixedWorkbook(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" /></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R1" /></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="${MAIN_NS}"><x:sheets><x:sheet name="Participants" sheetId="1" r:id="R2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R2" /></Relationships>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="${MAIN_NS}"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Prénom</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Nom</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>Emma</x:t></x:is></x:c><x:c r="B2" t="inlineStr"><x:is><x:t>Bernard</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildOrdinaryWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Participants");
  ws.addRow(["Prénom", "Nom"]);
  ws.addRow(["Emma", "Bernard"]);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

describe("normalizePrefixedXlsx", () => {
  it("makes a prefixed, absolute-target workbook readable by exceljs", async () => {
    const original = await buildPrefixedWorkbook();

    // Establish the bug is real: exceljs cannot read the original at all.
    const before = new ExcelJS.Workbook();
    await expect(
      before.xlsx.load(original as unknown as Parameters<typeof before.xlsx.load>[0]),
    ).rejects.toThrow();

    const normalized = await normalizePrefixedXlsx(original);
    expect(normalized).not.toBeNull();

    const after = new ExcelJS.Workbook();
    await after.xlsx.load(normalized as unknown as Parameters<typeof after.xlsx.load>[0]);
    expect(after.worksheets.map((s) => s.name)).toEqual(["Participants"]);
    const sheet = after.worksheets[0];
    expect(String(sheet.getRow(1).getCell(1).value)).toBe("Prénom");
    expect(String(sheet.getRow(2).getCell(1).value)).toBe("Emma");
    expect(String(sheet.getRow(2).getCell(2).value)).toBe("Bernard");
  });

  it("leaves an ordinary exceljs-written workbook untouched", async () => {
    // Returning null is what keeps the normal path zero-risk: the original
    // bytes go to exceljs unmodified.
    expect(await normalizePrefixedXlsx(await buildOrdinaryWorkbook())).toBeNull();
  });

  it("returns null for something that is not a zip at all", async () => {
    expect(await normalizePrefixedXlsx(Buffer.from("this is not a zip"))).toBeNull();
  });
});
