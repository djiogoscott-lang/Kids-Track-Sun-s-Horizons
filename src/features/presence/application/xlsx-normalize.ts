import JSZip from "jszip";

/**
 * Rewrites the two valid-but-unsupported OOXML shapes that make exceljs
 * fail to open an otherwise perfectly good .xlsx:
 *
 *   1. parts that use a *namespace prefix* (<x:workbook>) instead of a
 *      default namespace;
 *   2. relationships whose Target is *package-absolute* ("/xl/…") instead
 *      of relative to the part's own folder.
 *
 * Both appear together in files produced by several common generators
 * (ClosedXML/EPPlus and a number of online "export to Excel" tools). Excel
 * itself writes neither, which is why exceljs never had to handle them.
 *
 * Both forms are valid OOXML and mean exactly the same thing:
 *
 *   <workbook xmlns="…/spreadsheetml/2006/main"><sheets><sheet …/></sheets></workbook>
 *   <x:workbook xmlns:x="…/spreadsheetml/2006/main"><x:sheets><x:sheet …/></x:sheets></x:workbook>
 *
 * Excel itself writes the first; several generators (ClosedXML/EPPlus and a
 * number of online "export to Excel" tools) write the second. exceljs's
 * parsers match on bare local names, so against the prefixed form its
 * workbook parser matches nothing, returns undefined, and load() dies with
 * "Cannot read properties of undefined (reading 'sheets')" — which the app
 * could only report as the misleading "Fichier illisible". The file is fine;
 * the parser is the limitation.
 *
 * Rather than fork exceljs, normalize the bytes before handing them over.
 * Only the prefix bound to the SpreadsheetML *main* namespace is stripped —
 * `r:id` and friends stay prefixed, exactly as they are in files Excel
 * writes and as exceljs expects.
 */

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** Finds the prefix bound to the SpreadsheetML main namespace, if the
 * document binds it to one at all (`xmlns:x="…main"`). Returns null for the
 * ordinary default-namespace form, which needs no rewriting. */
function findMainNamespacePrefix(xml: string): string | null {
  const match = xml.match(new RegExp(`xmlns:([A-Za-z0-9_.-]+)\\s*=\\s*"${MAIN_NS}"`));
  return match ? match[1] : null;
}

function stripPrefix(xml: string, prefix: string): string {
  const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    xml
      // <x:sheet …>, </x:sheet>, <x:sheet/>
      .replace(new RegExp(`<${p}:`, "g"), "<")
      .replace(new RegExp(`</${p}:`, "g"), "</")
      // The binding itself becomes the default namespace so the document
      // still declares which vocabulary it uses.
      .replace(new RegExp(`xmlns:${p}\\s*=\\s*"${MAIN_NS}"`, "g"), `xmlns="${MAIN_NS}"`)
  );
}

/** Parts whose root vocabulary is SpreadsheetML main. Relationship parts
 * (.rels) use a different namespace and are handled separately. */
function isSpreadsheetPart(name: string): boolean {
  return name.endsWith(".xml") && !name.endsWith(".rels");
}

/**
 * Rewrites a package-absolute relationship target ("/xl/tables/table1.xml")
 * as one relative to the folder the .rels file describes
 * ("../tables/table1.xml").
 *
 * The OOXML spec allows both, but exceljs indexes parsed parts by their
 * *relative* target and then looks them up by whatever the relationship
 * says — so an absolute target silently resolves to nothing. For a
 * worksheet's table that produces an undefined entry and load() dies with
 * "Cannot read properties of undefined (reading 'name')".
 */
function toRelativeTarget(fromDir: string, absoluteTarget: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const to = absoluteTarget.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...Array(from.length - common).fill(".."), ...to.slice(common)].join("/");
}

/**
 * Returns a normalized buffer when the workbook needs either fix, or null
 * when it is already in the form exceljs understands — so the common case
 * pays only one cheap zip read and the original bytes reach exceljs
 * completely untouched.
 */
export async function normalizePrefixedXlsx(buffer: Buffer): Promise<Buffer | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return null; // not a readable zip at all — let exceljs report it
  }

  const workbookFile = zip.file("xl/workbook.xml");
  if (!workbookFile) return null;

  let changed = false;

  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;

    if (name.endsWith(".rels")) {
      const xml = await entry.async("string");
      const relsIndex = name.lastIndexOf("/_rels/");
      const baseDir = relsIndex === -1 ? "" : name.slice(0, relsIndex);
      const rewritten = xml.replace(/Target="\/([^"]+)"/g, (_full, target: string) => `Target="${toRelativeTarget(baseDir, target)}"`);
      if (rewritten !== xml) {
        zip.file(name, rewritten);
        changed = true;
      }
      continue;
    }

    if (!isSpreadsheetPart(name)) continue;
    const xml = await entry.async("string");
    // Each part declares its own binding, so the prefix is resolved per file
    // rather than assuming the workbook's prefix is used everywhere.
    const partPrefix = findMainNamespacePrefix(xml);
    if (!partPrefix) continue;
    zip.file(name, stripPrefix(xml, partPrefix));
    changed = true;
  }

  if (!changed) return null;
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
