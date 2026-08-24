# Kids Track — Sun’s Horizons

Application de gestion des présences pour **Sun’s Horizons ASBL** (Bruxelles), qui organise des activités parascolaires, des stages et des cours sportifs et culturels pour enfants. Kids Track remplace la feuille de présence papier des moniteurs par un outil numérique simple : qui est arrivé, qui est absent, qui est parti, et qui est encore là.

Ceci est la **V0.1** : un prototype fonctionnel et démontrable, pensé pour être utilisé sur un téléphone en quelques secondes, sans formation.

## Le problème

Les moniteurs suivent aujourd'hui les présences sur papier. C'est fonctionnel, mais :

- erreurs de saisie et écriture difficile à relire ;
- feuilles perdues ou abîmées ;
- aucune vue instantanée de la situation ("qui est encore là ?") ;
- risque d'oublier un départ.

Kids Track ne cherche pas à digitaliser toute la gestion de l'ASBL. Il répond à une seule mission : rendre l'appel du matin et le départ du soir rapides, fiables et sans ambiguïté sur un téléphone.

## La logique de présence, volontairement minimale

Une première version couvrait un modèle à 5 statuts (attendu / présent / en retard / absent / excusé / parti) avec des séances chronométrées et une clôture formelle. Après relecture, ce modèle demandait trop de lecture et trop de choix à un moniteur qui fait l'appel d'une main, téléphone dans l'autre. La V0.1 actuelle repose sur deux faits indépendants par enfant, par jour :

- **Le matin (Appel)** : l'enfant est **🟢 Arrivé** ou **🔴 Absent**. Rien d'autre — même un enfant en retard se pointe simplement "Arrivé".
- **Le soir (Départ)** : l'enfant est **🟢 Parti** ou **🟠 Encore présent**. Après **16h15** (heure de Bruxelles), tout enfant encore présent passe automatiquement en **🔵 Garderie** — un calcul, jamais un choix du moniteur.

Chaque ligne présente les deux actions possibles comme deux gros boutons toujours visibles (pas un interrupteur unique) : moins de risque de valider la mauvaise action par erreur.

## Ce que fait la V0.1

- **Connexion démo sans configuration** : un compte Administrateur et un compte par moniteur (Moniteur 1 à 4), un clic pour se connecter — voir [Démarrage](#démarrage).
- **Accueil (admin)** : les 4 activités du jour (Danse, Multisport, Vélo, Baby Tennis), avec effectif, arrivés et absents en un coup d'œil.
- **Un moniteur arrive directement sur son activité** après connexion — il n'a qu'un seul écran à connaître.
- **Écran d'activité** : un sélecteur Appel / Départ (toujours manuel, jamais de bascule automatique surprise) et la liste des enfants avec deux boutons tactiles par ligne.
- **Administration** : réassigner le moniteur d'une activité en un clic ; réassigner un moniteur déjà en poste ailleurs l'échange automatiquement avec l'occupant actuel, pour qu'un moniteur ne se retrouve jamais sur deux activités à la fois.

## Stack

| Choix | Justification |
|---|---|
| Next.js (App Router) + React + TypeScript | Server Components pour les lectures, Server Actions pour les mutations, sans couche API séparée à maintenir pour un MVP. |
| Tailwind CSS | Design system par tokens, cohérent avec la charte Sun’s Horizons, sans bibliothèque de composants lourde. |
| Supabase (Postgres + Auth + RLS) | Auth prête à l'emploi dès qu'un vrai déploiement est nécessaire — voir [Mode démo vs mode réel](#mode-démo-vs-mode-réel). |
| Vitest | Tests rapides pour la logique métier (classification Garderie, commandes de présence, échange d'assignation). |

Aucune dépendance n'a été ajoutée sans raison : pas de gestionnaire d'état global, pas de bibliothèque de formulaires, pas de client GraphQL.

## Architecture

```
src/
  app/
    (auth)/login/            Connexion (formulaire réel ou démo selon la configuration)
    (app)/
      activities/            Accueil (grille) + écran d'une activité (Appel/Départ)
      admin/                 Réassignation moniteur ↔ activité
  components/
    ui/                      Boutons, cartes, états vides — primitives génériques
    auth/                    Formulaire de connexion réel + options de connexion démo
    brand/                   Identité visuelle Sun’s Horizons
  features/
    presence/
      domain/                Logique pure : deux faits (arrivé/parti) + calcul Garderie
      application/           Commandes (marquer arrivé/absent/parti) et requêtes
      ui/                    Lignes enfant, onglets, carte d'activité, formulaire d'assignation
  server/
    demo/                    Données et état en mémoire (V0.1, voir ci-dessous)
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

- utilise un jeu de données réaliste en mémoire (`src/server/demo`), régénéré à chaque démarrage du serveur ;
- authentifie via des comptes de démonstration (cookie de session signé, pas de mot de passe) au lieu de Supabase Auth.

Dès que `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont renseignées, l'application bascule automatiquement sur l'authentification Supabase réelle — c'est le même code, pas un mode séparé à maintenir.

**Note sur le schéma Supabase** : `supabase/migrations/20260824120000_foundation.sql` modélise encore l'ancien système à 5 statuts avec séances chronométrées (`attendance_events`, retard, clôture). Il n'a pas été réduit au modèle Arrivé/Absent/Parti actuel — le brancher tel quel demanderait d'abord de l'aligner sur cette logique plus simple. Tant que la V0.1 tourne en mode démo, ce n'est pas bloquant.

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

- **MONITOR** : atterrit directement sur son activité assignée après connexion ; peut marquer arrivées/absences le matin et départs le soir uniquement pour cette activité.
- **ADMIN** : voit les 4 activités, peut ouvrir n'importe laquelle, et réassigne les moniteurs depuis `/admin`.

Un moniteur qui tente d'accéder à l'URL d'une autre activité que la sienne est redirigé vers la sienne.

## Tests

`npm test` couvre : le calcul du statut Garderie avant/à/après 16h15, les commandes de présence (arrivée, absence qui efface un départ existant, départ refusé sans arrivée préalable, annulation d'un départ), et l'échange d'assignation moniteur ↔ activité (aucun moniteur ne se retrouve sur deux activités après une réassignation).

## Limites connues de la V0.1

- Les activités et enfants sont des données de démonstration en mémoire, pas encore persistées dans Supabase.
- Le seuil de 16h15 est un réglage global fixe (pas encore configurable par activité).
- Pas de mode hors-ligne réel, pas d'historique/audit visible côté interface (les deux faits arrivé/parti suffisent pour cette version).

## Roadmap

- **Phase 2** — vraies activités et enfants persistés, schéma Supabase aligné sur le modèle Arrivé/Absent/Parti.
- **Phase 3** — notifications, exports, statistiques.
- **Phase 4** — application mobile, mode hors-ligne, synchronisation.
