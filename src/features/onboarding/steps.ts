export interface OnboardingStep {
  /** data-tour value of the element to spotlight; omit for a centered welcome/closing card. */
  target?: string;
  icon: string;
  title: string;
  body: string;
}

// Capped at 6 steps on purpose (welcome + 4 features + closing) so the tour
// stays short enough that nobody skips it out of fatigue.
export const MONITOR_STEPS: OnboardingStep[] = [
  { icon: "👋", title: "Bienvenue !", body: "Voici les fonctionnalités principales de l'application." },
  {
    target: "presence-card",
    icon: "📋",
    title: "Présence",
    body: "Le matin, fais l'appel ici : indique simplement si chaque enfant est présent ou absent.",
  },
  {
    target: "departures-card",
    icon: "🚪",
    title: "Départs",
    body: "Le soir, utilise cette section pour enregistrer les départs, un enfant à la fois.",
  },
  {
    target: "garderie-card",
    icon: "🏠",
    title: "Garderie",
    body: "Les enfants encore présents après la fin de la séance y sont transférés automatiquement — rien à faire de ton côté.",
  },
  {
    target: "notifications-card",
    icon: "🔔",
    title: "Notifications",
    body: "Tu reçois ici les informations importantes envoyées par l'administration, en direct.",
  },
  { icon: "✅", title: "Tu es prêt !", body: "Tu peux maintenant utiliser l'application." },
];

export const ADMIN_STEPS: OnboardingStep[] = [
  { icon: "👋", title: "Bienvenue !", body: "Voici comment gérer votre organisation." },
  {
    target: "nav-children",
    icon: "👧",
    title: "Enfants & Activités",
    // Deliberately no activity names: each school defines its own, so naming
    // one school's activities here would be wrong for every other school.
    body: "Ajoutez et gérez les enfants, et retrouvez les activités de l'école dans Activités.",
  },
  {
    target: "nav-monitors",
    icon: "👤",
    title: "Moniteurs",
    body: "Associez chaque moniteur à une activité — modifiable à tout moment, sans conflit possible.",
  },
  {
    target: "nav-presences",
    icon: "📋",
    title: "Présences & Départs",
    body: "Suivez la présence et les départs de toutes les activités depuis un seul endroit.",
  },
  {
    target: "nav-garderie",
    icon: "🏠",
    title: "Garderie & Notifications",
    body: "Consultez qui est en garderie, et informez un moniteur en un instant.",
  },
  { icon: "✅", title: "Vous êtes prêt !", body: "Vous pouvez maintenant gérer votre organisation." },
];
