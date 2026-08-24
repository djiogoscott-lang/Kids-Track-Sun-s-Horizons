export const FIRST_NAMES = [
  "Lucas", "Emma", "Noah", "Adam", "Léa", "Gabriel", "Chloé", "Nathan",
  "Manon", "Louis", "Camille", "Hugo", "Inès", "Arthur", "Zoé", "Jules",
  "Lina", "Liam", "Sarah", "Mohamed", "Yasmine", "Ethan", "Alice", "Rayan",
  "Juliette", "Maël", "Nour", "Théo", "Amina", "Oscar", "Elena", "Samuel",
  "Mila", "Victor", "Safia", "Léon", "Rose", "Antoine", "Salma", "Milo",
  "Anaïs", "Baptiste", "Yasmina", "Enzo", "Clara", "Amir", "Louise", "Noa",
  "Karim", "Eva",
] as const;

export const LAST_NAMES = [
  "Martin", "Dupont", "Bernard", "Smith", "Lambert", "El Amrani", "Peeters",
  "Janssens", "Dubois", "Lemaire", "Moreau", "Simon", "Leroy", "Fontaine",
  "Van Damme", "De Clercq", "Willems", "Mahieu", "Rousseau", "Vidal",
  "El Idrissi", "Colson", "Deprez", "Renard", "Alaoui", "Gilson", "Wauters",
  "Nguyen", "Traoré", "Adam",
] as const;

export function nameAt(index: number): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[index % FIRST_NAMES.length],
    lastName: LAST_NAMES[(index * 7) % LAST_NAMES.length],
  };
}
