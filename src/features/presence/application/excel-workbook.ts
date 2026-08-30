import ExcelJS from "exceljs";
import type { ChildAdminRow, RosterByActivity } from "@/features/presence/application/queries";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10213E" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Enfants");
  sheet.columns = [
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Activité", key: "activity", width: 18 },
    { header: "Garderie", key: "garderie", width: 12 },
    { header: "Actif", key: "active", width: 10 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRow({ firstName: "Lucas", lastName: "Martin", activity: "Danse", garderie: "Oui", active: "Oui", notes: "" });
  sheet.addRow({ firstName: "Emma", lastName: "Bernard", activity: "Danse", garderie: "Non", active: "Oui", notes: "" });
  sheet.addRow({ firstName: "Noah", lastName: "Dupont", activity: "Multisport", garderie: "Oui", active: "Oui", notes: "Allergie arachides" });

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 90 }];
  const lines = [
    "COMMENT REMPLIR CE FICHIER",
    "",
    "1 ligne = 1 enfant. Ne modifiez pas les en-têtes de colonnes de la feuille \"Enfants\".",
    "",
    "Prénom : obligatoire.",
    "Nom : obligatoire.",
    "Activité : obligatoire — écrivez exactement l'un de : Danse, Multisport, Vélo, Baby Tennis.",
    "Garderie : écrivez Oui ou Non. Laissé vide = Non.",
    "Actif : écrivez Oui ou Non. Laissé vide = Oui.",
    "Notes : facultatif (allergies, contact particulier, information utile...).",
    "",
    "Avant d'être réellement ajoutées, toutes les lignes sont vérifiées et vous",
    "verrez un aperçu avec les éventuelles erreurs ou doublons avant de confirmer.",
  ];
  lines.forEach((line, i) => {
    const row = instructions.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 13 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildRosterTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Participants");
  sheet.columns = [
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Activité", key: "activity", width: 18 },
    { header: "Semaine", key: "week", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRow({ firstName: "Lucas", lastName: "Martin", activity: "Danse", week: "" });
  sheet.addRow({ firstName: "Emma", lastName: "Bernard", activity: "Danse", week: "" });
  sheet.addRow({ firstName: "Noah", lastName: "Dupont", activity: "Multisport", week: "" });

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 90 }];
  const lines = [
    "COMMENT REMPLIR CE FICHIER",
    "",
    "1 ligne = 1 participant pour la semaine en cours d'import.",
    "",
    "Prénom, Nom : doivent correspondre exactement à un enfant déjà connu — sinon vous pourrez choisir de créer sa fiche.",
    "Activité : écrivez exactement l'un de : Danse, Multisport, Vélo, Baby Tennis.",
    "Semaine : facultatif. Si rempli (AAAA-MM-JJ ou JJ/MM/AAAA), doit correspondre à la semaine importée, sinon la ligne est signalée.",
    "",
    "Cet import ne modifie jamais les fiches enfants existantes ni les semaines précédentes.",
    "Un aperçu avec les éventuelles erreurs sera affiché avant toute écriture.",
  ];
  lines.forEach((line, i) => {
    const row = instructions.addRow([line]);
    if (i === 0) row.font = { bold: true, size: 13 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildRosterExportWorkbook(weekStart: string, roster: RosterByActivity[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Semaine du ${weekStart}`);
  sheet.columns = [
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Activité", key: "activity", width: 18 },
    { header: "Semaine", key: "week", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));
  for (const activity of roster) {
    for (const participant of activity.participants) {
      sheet.addRow({ firstName: participant.firstName, lastName: participant.lastName, activity: activity.activityName, week: weekStart });
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildExportWorkbook(children: ChildAdminRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Enfants");
  sheet.columns = [
    { header: "Prénom", key: "firstName", width: 18 },
    { header: "Nom", key: "lastName", width: 18 },
    { header: "Activité", key: "activity", width: 18 },
    { header: "Garderie", key: "garderie", width: 12 },
    { header: "Actif", key: "active", width: 10 },
    { header: "Notes", key: "notes", width: 40 },
    { header: "Date de création", key: "createdAt", width: 18 },
  ];
  styleHeaderRow(sheet.getRow(1));
  for (const child of children) {
    sheet.addRow({
      firstName: child.firstName,
      lastName: child.lastName,
      activity: child.activityName,
      garderie: child.daycareAuto ? "Oui" : "Non",
      active: child.active ? "Oui" : "Non",
      notes: child.notes,
      createdAt: child.createdAt.getTime() === 0 ? "" : child.createdAt.toLocaleDateString("fr-BE"),
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
