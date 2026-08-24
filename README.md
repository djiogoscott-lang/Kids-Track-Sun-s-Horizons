# Kids Track — Sun’s Horizons

Application de gestion des présences pour **Sun’s Horizons ASBL** (Bruxelles), qui organise des activités parascolaires, des stages et des cours sportifs et culturels pour enfants. Kids Track remplace la feuille de présence papier des moniteurs par un outil numérique simple : qui est arrivé, qui est absent, qui est parti, et qui est encore là.

Ceci est la **V0.1** : un prototype fonctionnel et démontrable, pensé pour être utilisé sur un téléphone en quelques secondes, sans formation. Les enfants affichés portent des noms fictifs mais réalistes (aucun ne correspond à une vraie personne) ; les moniteurs restent volontairement génériques (`Moniteur 1`…) — voir [Démo aujourd'hui → données réelles demain](#démo-aujourdhui--données-réelles-demain) pour la suite.

## Identité visuelle

Le logo et les couleurs viennent du vrai site (sunshorizons.be), pas d'une identité inventée :

- **Logo** : `public/logo.png`, utilisé sur l'écran de connexion et dans l'en-tête — c'est la marque officielle, jamais un texte ou un symbole de substitution.
- **Favicon** : `src/app/icon.png` / `apple-icon.png` reprennent le symbole du site (Next.js génère les balises `<link rel="icon">` automatiquement).
- **Palette** : les quatre couleurs d'accent (rouge, bleu, or, vert — voir `src/app/globals.css`) sont échantillonnées directement depuis le favicon officiel, pas choisies au hasard. Elles servent à la fois de couleurs de statut (présent/absent/garderie) et d'identité par activité (Danse/Multisport/Vélo/Baby Tennis), et retrouvent les quatre points colorés du chargement.
- **Violet et jaune** viennent, eux, du dégradé de couleurs du vrai site (sunshorizons.be) et complètent la palette avec un rôle précis chacun : le violet marque les éléments secondaires (points de progression du guide de découverte), le jaune signale un élément important (le sous-compte "issus des départs" sur la carte Garderie). Aucune des six couleurs n'est utilisée "pour faire joli" — chacune a une seule fonction, toujours la même.
- **Chargement** : un loader à quatre points (les mêmes couleurs) qui s'allument en séquence, sans aucun texte technique — jamais "Compiling"/"Building", y compris le badge de développement Next.js, désactivé (`devIndicators: false`).

## Le problème

Les moniteurs suivent aujourd'hui les présences sur papier. C'est fonctionnel, mais :

- erreurs de saisie et écriture difficile à relire ;
- feuilles perdues ou abîmées ;
- aucune vue instantanée de la situation ("qui est encore là ?") ;
- risque d'oublier un départ ou un enfant en garderie.

Kids Track ne cherche pas à digitaliser toute la gestion de l'ASBL. Il répond à une mission précise : rendre l'appel du matin, le départ du soir et la garderie rapides, fiables et sans ambiguïté sur un téléphone — avec une administration complète en arrière-plan.

## La logique de présence, volontairement minimale côté moniteur

La V0.1 repose sur deux faits indépendants par enfant, par jour :

- **Le matin (Présences)** : l'enfant est **🟢 Arrivé** ou **🔴 Absent**. Rien d'autre — même un enfant en retard se pointe simplement "Arrivé".
- **Le soir (Départs)** : l'enfant est **🟢 Parti** ou **🟠 Encore présent**. Après **16h15** (heure de Bruxelles) ou dès que le moniteur clôture la séance — le premier des deux qui arrive — tout enfant encore présent passe automatiquement en **🔵 Garderie**.

Chaque ligne présente les deux actions possibles comme deux gros boutons toujours visibles (pas un interrupteur unique) : moins de risque de valider la mauvaise action par erreur.

### Garderie : deux raisons, une seule liste

La page **🏠 Garderie** est partagée entre toutes les activités (un enfant n'y va pas "pour" son activité, il y va tout court). Deux façons d'y arriver, toujours distinguées :

- **Garderie prévue** : la fiche de l'enfant indique "garderie automatique" — il y apparaît dès son arrivée le matin, sans attendre la fin de son activité. Il ne passe jamais par la liste de départ classique de son activité.
- **Garderie après séance** : l'enfant était dans le circuit normal (arrivée → départ) mais est encore présent quand son activité est clôturée ou que 16h15 sonne. Le transfert est automatique — jamais une action manuelle du moniteur.

### Clôturer une activité

Le moniteur dispose d'un bouton **✓ Clôturer la séance**, protégé par une confirmation ("Voulez-vous vraiment clôturer cette séance ?"). Une fois clôturée, les écrans Présences et Départs de cette activité sont verrouillés pour la journée, et tout enfant encore marqué présent est automatiquement en garderie.

## Ce que fait la V0.1

**Côté moniteur** (interface volontairement réduite à l'essentiel) :
- Connexion en un clic (compte de démonstration par moniteur), arrivée directe sur son activité — aucune liste à choisir.
- **Accueil** (nouvel écran d'atterrissage), Présences, Départs, Garderie, Notifications : cinq écrans, pas un de plus, en barre d'onglets fixe en bas d'écran (une main sur le téléphone, l'autre pour l'appel). Présence et Départs restent les deux actions les plus grandes et les plus visibles de l'écran d'accueil — voir [Écran d'accueil & barre de situation](#écran-daccueil--barre-de-situation).
- Compteurs en direct qui se mettent à jour immédiatement, et un badge de notification qui apparaît sans recharger la page — voir [Temps réel](#temps-réel).
- Un guide de découverte interactif à la première connexion, rejouable à tout moment — voir [Découverte guidée](#découverte-guidée).

**Côté administrateur** (accès direct, pas de tableau de bord statistique) :
- Enfants : ajouter, modifier, désactiver, associer à une activité, définir la garderie automatique, ajouter une note libre.
- Activités, Moniteurs (réassignation avec échange automatique pour qu'un moniteur ne se retrouve jamais sur deux activités à la fois).
- Présences et Départs : toutes les activités du jour sur un seul écran, avec les mêmes actions que la vue moniteur.
- Garderie et Notifications (composer un message ciblé, ex. "le parent d'Emma la récupère à 15h30"), partagées avec la vue moniteur.

## Temps réel

Les notifications sont poussées en direct par **Server-Sent Events** (`/api/notifications/stream`), pas par un `setInterval` qui interroge le serveur en boucle : chaque moniteur connecté tient un flux HTTP léger, abonné au canal de sa seule activité, et le navigateur (`EventSource`) se reconnecte tout seul si la connexion tombe. Quand l'administrateur envoie un message, le magasin en mémoire publie l'évènement sur ce canal ; le badge et une notification visuelle apparaissent instantanément chez le moniteur concerné, sans rechargement — et se remettent à zéro dès qu'il ouvre l'écran Notifications. Choisi plutôt qu'un WebSocket (le flux est à sens unique, rien ne le justifie) ou un abonnement de base de données (aucune vraie base branchée pour l'instant).

Les compteurs de présence, eux, se mettaient déjà à jour sans rechargement avant cette passe — c'est le comportement natif des Server Actions + `revalidatePath` de Next.js, pas quelque chose de spécifique aux notifications.

## Écran d'accueil & barre de situation

L'écran d'accueil du moniteur (`/activities/[id]`, sans paramètre `tab`) affiche la date, l'heure, et une **barre de situation** qui indique automatiquement la phase en cours de la journée — accueil, activités en cours, départs, garderie — calculée depuis l'horloge (`features/presence/domain/day-phase.ts`, pure, sans effet de bord, testée aux quatre bornes horaires). En dessous, quatre grandes cartes reprennent les compteurs en direct de Présence, Départs, Garderie (avec ses deux sous-comptes — 🟠 arrivés automatiquement, 🟡 issus des départs) et Notifications ; chacune mène directement à l'écran détaillé correspondant. C'est l'écran vu en premier après connexion, mais les écrans détaillés (appel du matin, gestion des départs) restent inchangés et accessibles via leurs propres onglets.

## Découverte guidée

À la toute première connexion (par utilisateur, via `localStorage`), une visite guidée interactive met en évidence les éléments clés de l'interface un par un — une bulle d'aide positionnée sur l'élément réel, pas un tutoriel séparé en plusieurs pages. Maximum 6 étapes, avec Suivant/Retour/Passer/Terminer et des points de progression. Le contenu diffère selon le rôle : le moniteur voit Présence, Départs, Garderie et Notifications ; l'administrateur voit ses sept sections regroupées en quatre étapes de contenu (Enfants & Activités, Moniteurs, Présences & Départs, Garderie & Notifications) pour rester sous la limite. Le guide peut être rejoué à tout moment via le bouton **?** dans l'en-tête → "Revoir le guide" (`features/onboarding/`). Un petit "💡 Conseil" ponctuel, dismissible et qui ne revient plus une fois fermé, complète la découverte sur l'écran de présence (`components/ui/dismissible-tip.tsx`).

## Démo aujourd'hui → données réelles demain

Aujourd'hui, `Enfant 1`, `Enfant 2`… Demain, `Lucas Martin`, `Emma Dupont`… Le passage de l'un à l'autre est déjà préparé dans l'architecture, pas seulement promis :

1. **Rien dans l'interface ne connaît de nom en dur.** Chaque écran lit les enfants via `features/presence/application/queries.ts`, qui lit elle-même `server/demo/children-store.ts`. Remplacer les données ne touche ni `domain/`, ni `ui/`, ni les pages.
2. **Le stockage est déjà un vrai CRUD**, juste en mémoire pour l'instant : `getChildren`, `createChild`, `updateChild`, `setChildActive` dans `server/demo/children-store.ts`. L'administrateur les utilise déjà aujourd'hui via `/admin/children` pour ajouter ou modifier un enfant fictif.
3. **La bascule vers de vraies données réelles consiste à réécrire un seul fichier** : remplacer les fonctions de `children-store.ts` (et `store.ts`, `activity-day-store.ts`, `notifications-store.ts`) par des requêtes vers `supabase/migrations/`, sans changer leur signature. Le reste de l'application continue de fonctionner à l'identique.
4. **L'authentification bascule déjà automatiquement** : dès que les variables Supabase sont renseignées (voir ci-dessous), le formulaire email/mot de passe remplace les comptes de démonstration, sans code séparé à maintenir.

## Stack

| Choix | Justification |
|---|---|
| Next.js (App Router) + React + TypeScript | Server Components pour les lectures, Server Actions pour les mutations, sans couche API séparée à maintenir pour un MVP. |
| Tailwind CSS | Design system par tokens, cohérent avec la charte Sun’s Horizons, sans bibliothèque de composants lourde. |
| Supabase (Postgres + Auth + RLS) | Auth prête à l'emploi dès qu'un vrai déploiement est nécessaire — voir [Mode démo vs mode réel](#mode-démo-vs-mode-réel). |
| Vitest | Tests rapides pour la logique métier (calcul Garderie, commandes de présence, échange d'assignation). |

Aucune dépendance n'a été ajoutée sans raison : pas de gestionnaire d'état global, pas de bibliothèque de formulaires, pas de client GraphQL.

## Architecture

```
src/
  app/
    (auth)/login/            Connexion (formulaire réel ou démo selon la configuration)
    (app)/
      activities/            Accueil (grille) + écran d'une activité (Présences/Départs)
      garderie/              Liste Garderie, partagée moniteur/admin
      notifications/         Messages reçus (vue moniteur, live)
      admin/
        children/            Liste, ajout, édition des enfants
        monitors/            Association moniteur ↔ activité
        presences/           Présences de toutes les activités (admin)
        departures/          Départs de toutes les activités (admin)
        notifications/       Composer et historique des messages envoyés
    api/notifications/stream/ Route SSE : pousse les notifications en direct
  components/
    ui/                      Boutons, cartes, états vides, loader, conseil dismissible — primitives génériques
    auth/                    Formulaire de connexion réel + options de connexion démo
    brand/                   Identité visuelle Sun’s Horizons
    layout/                  Barre d'onglets mobile du moniteur (5 onglets, dont Accueil)
  features/
    notifications/           Contexte client (liste + badge live) + abonnement SSE + carte d'aperçu Accueil
    onboarding/               Guide de découverte : étapes par rôle, overlay coach-mark, bouton "?"
    presence/
      domain/                Logique pure : arrivé/parti, statut Garderie, raison Garderie, phase du jour
      application/           Commandes (CRUD enfants, présence, clôture, notifications) et requêtes
      ui/                    Écran Accueil (barre de situation + cartes), lignes enfant, onglets, compteurs, icônes d'activité, formulaires d'administration
  server/
    demo/                    Données et état en mémoire (V0.1) : enfants, présences, clôtures, notifications + bus d'évènements
  lib/
    auth/                    Session courante (démo ou Supabase), garde d'accès par rôle
    supabase/                Clients Supabase (navigateur, serveur, proxy de session)
    env.ts, format.ts, utils.ts
supabase/
  migrations/                Schéma Postgres — voir la note ci-dessous
```

C'est une **architecture monolithique modulaire** : un seul déploiement, mais des frontières nettes (`domain` ne connaît ni la base de données ni React ; `application` orchestre ; `ui` ne contient pas de règles métier).

## Mode démo vs mode réel

La V0.1 doit pouvoir être démontrée **sans configuration cloud**. Tant que les variables Supabase ne sont pas renseignées, l'application :

- utilise un jeu de données fictif en mémoire (`src/server/demo`), régénéré à chaque démarrage du serveur ;
- authentifie via des comptes de démonstration (cookie de session signé, pas de mot de passe) au lieu de Supabase Auth.

Dès que `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont renseignées, l'application bascule automatiquement sur l'authentification Supabase réelle — c'est le même code, pas un mode séparé à maintenir.

**Note sur le schéma Supabase** : `supabase/migrations/20260824120000_foundation.sql` modélise encore l'ancien système à 5 statuts avec séances chronométrées. Il n'a pas été aligné sur le modèle Arrivé/Absent/Parti + Garderie actuel — c'est le travail de la Phase 2 (voir [Roadmap](#roadmap)). Tant que la V0.1 tourne en mode démo, ce n'est pas bloquant.

## Démarrage

1. Installer Node.js LTS.
2. `npm install`
3. `npm run dev`
4. Ouvrir `http://localhost:3000` et se connecter avec l'un des comptes de démonstration affichés (Administrateur, ou Moniteur 1 à 4 pour aller directement sur une activité).

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Rôles

- **MONITOR** : atterrit directement sur son activité assignée après connexion ; marque arrivées/absences et départs uniquement pour cette activité ; accède à la Garderie (partagée) et à ses Notifications.
- **ADMIN** : accède directement aux enfants, activités, moniteurs, présences, départs, garderie et notifications — pas de tableau de bord intermédiaire.

Un moniteur qui tente d'accéder à l'URL d'une autre activité que la sienne est redirigé vers la sienne.

## Tests

`npm test` couvre : le calcul du statut Garderie avant/à/après 16h15 et selon la clôture, la distinction garderie prévue / garderie après séance, les commandes de présence (arrivée, absence qui efface un départ existant, départ refusé sans arrivée préalable, annulation d'un départ), l'échange d'assignation moniteur ↔ activité, le bus de notifications (comptage des non-lus par activité, remise à zéro à la lecture, cloisonnement entre activités, abonnement/désabonnement aux évènements), et le calcul de la phase du jour (accueil/activités/départs/garderie) aux quatre bornes horaires.

## Limites connues de la V0.1

- Les activités et enfants sont des données en mémoire, pas encore persistées dans une vraie base — voir [Démo aujourd'hui → données réelles demain](#démo-aujourdhui--données-réelles-demain) pour le chemin de migration déjà préparé.
- Le seuil de 16h15 est un réglage global fixe (pas encore configurable par activité).
- Pas de mode hors-ligne réel.
- Le flux SSE tient une connexion HTTP ouverte par moniteur connecté ; convient bien à `npm run dev` et à un déploiement Node classique, mais un hébergement serverless à la durée d'exécution très limitée demanderait d'adapter le transport (le `EventSource` du navigateur se reconnecte déjà seul, ce qui absorbe une bonne partie du risque).

## Roadmap

- **Phase 2** — brancher `server/demo/*` sur Supabase (schéma aligné sur Arrivé/Absent/Parti/Garderie), import des vrais enfants et moniteurs.
- **Phase 3** — exports, statistiques, informations d'inscription plus riches (contacts, allergies structurées).
- **Phase 4** — application mobile, mode hors-ligne, synchronisation.
