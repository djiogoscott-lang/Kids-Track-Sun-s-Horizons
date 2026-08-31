import * as XLSX from "xlsx";

/**
 * Legacy .xls (BIFF8) support.
 *
 * The school's secretariat exports from an Excel that still writes the 1997
 * OLE2 compound-file format: the "Liste N°4 Prim NDC.xls" family starts with
 * the D0 CF 11 E0 signature, not the PK zip signature of .xlsx. exceljs only
 * ever reads OOXML, so those files failed at the very first byte — there was
 * no parser bug to fix, the format simply had no reader.
 *
 * Rather than teach the roster parser a second dialect, this module transcodes
 * BIFF8 into an in-memory .xlsx buffer and hands it back to the existing
 * exceljs path. Header detection, column mapping, name splitting, date
 * parsing and every test around them stay format-agnostic, and .xls gains
 * support without .xlsx changing behaviour at all.
 */

/** OLE2 Compound File signature — the container every real .xls uses. */
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Detects the format from the bytes rather than the file name. Secretariats
 * rename files, and "save as .xls" in some tools actually writes OOXML (and
 * vice-versa) — trusting the extension would reject perfectly readable files
 * and accept unreadable ones.
 */
export function isLegacyXls(buffer: Buffer): boolean {
  return buffer.length >= OLE2_SIGNATURE.length && buffer.subarray(0, OLE2_SIGNATURE.length).equals(OLE2_SIGNATURE);
}

/**
 * Reads a BIFF8 workbook and re-emits it as .xlsx bytes.
 *
 * Parsing is deliberately restricted to plain cell values: formulas are not
 * evaluated, VBA/macro storages are dropped rather than carried into the
 * output, and no external link is ever followed. `cellDates` is what makes a
 * birth date survive the round-trip as a real date instead of a serial
 * number, which is what the downstream date parsing relies on.
 *
 * Returns null when the buffer is not a legacy .xls, so callers can use it as
 * a pass-through guard.
 */
export function convertLegacyXlsToXlsx(buffer: Buffer): Buffer | null {
  if (!isLegacyXls(buffer)) return null;

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
    bookDeps: false,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) return null;

  const out = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
