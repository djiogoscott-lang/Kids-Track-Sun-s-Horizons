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
    { header: "Garderie", key: "garderie", width: 12 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRow({ firstName: "Emma", lastName: "Bernard", activity: "Danse", garderie: "Oui", notes: "" });
  sheet.addRow({ firstName: "Lucas", lastName: "Martin", activity: "Vélo", garderie: "Non", notes: "" });
  sheet.addRow({ firstName: "Jade", lastName: "André", activity: "Baby Tennis", garderie: "Oui", notes: "" });
  sheet.addRow({ firstName: "Arthur", lastName: "Blanc", activity: "Multisport", garderie: "Non", notes: "Allergie arachides" });

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 90 }];
  const lines = [
    "COMMENT REMPLIR CE FICHIER",
    "",
    "1 ligne = 1 participant pour la semaine choisie au moment de l'import (la semaine se choisit dans l'application, pas dans ce fichier).",
    "",
    "L'ordre des colonnes n'a pas d'importance — seuls les noms d'en-têtes comptent.",
    "",
    "Prénom : obligatoire.",
    "Nom : obligatoire.",
    "Activité : obligatoire — écrivez exactement l'une des activités autorisées : Danse, Multisport, Vélo, Baby Tennis.",
    "  Si votre fichier a une feuille par activité (un onglet \"Danse\", un onglet \"Vélo\"...), vous pouvez laisser la colonne Activité vide : l'application utilisera le nom de la feuille.",
    "Garderie : écrivez Oui ou Non. Laissé vide = Non.",
    "Notes : facultatif (allergies, contact particulier, information utile...).",
    "",
    "Si un enfant n'existe pas encore dans l'application, sa fiche est créée automatiquement.",
    "Si un enfant existe déjà, il est simplement ajouté à la liste de la semaine — jamais dupliqué.",
    "",
    "Avant toute écriture, un aperçu classé par activité s'affiche avec le détail de chaque ligne",
    "(nouveau, déjà connu, déjà inscrit, doublon, erreur) — rien n'est enregistré avant confirmation.",
    "Les semaines précédentes ne sont jamais modifiées par un nouvel import.",
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
  ];
  styleHeaderRow(sheet.getRow(1));
  for (const activity of roster) {
    for (const participant of activity.participants) {
      sheet.addRow({ firstName: participant.firstName, lastName: participant.lastName, activity: activity.activityName });
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
