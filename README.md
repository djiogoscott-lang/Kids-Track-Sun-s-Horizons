# Kids Track — Sun’s Horizons

Application de gestion des présences pour **Sun’s Horizons ASBL** (Bruxelles), qui organise des activités parascolaires, des stages et des cours sportifs et culturels pour enfants. Kids Track remplace la feuille de présence papier des moniteurs par un outil numérique fiable : qui est attendu, qui est arrivé, qui est présent, qui est parti, à quelle heure, et par qui.

Ceci est la **V0.1** : un prototype fonctionnel et démontrable, pas encore branché sur de vraies données d'enfants.

## Le problème

Les moniteurs suivent aujourd'hui les présences sur papier. C'est fonctionnel, mais :

- erreurs de saisie et écriture difficile à relire ;
- feuilles perdues ou abîmées ;
- aucune vue instantanée de la situation ("qui est encore là ?") ;
- aucune statistique, aucun historique exploitable ;
- corrections impossibles à tracer ;
- aucune visibilité pour l'administration ;
- risque d'oublier un départ.

Kids Track ne cherche pas à digitaliser toute la gestion de l'ASBL. Il répond à une seule mission : rendre la présence des enfants fiable, traçable et immédiatement consultable.

## Ce que fait la V0.1

- **Connexion démo sans configuration** : deux comptes (Administrateur / Monitrice) pour se connecter en un clic — voir [Démarrage](#démarrage).
- **Tableau de bord administrateur** : totaux du jour, séances actives, anomalies ouvertes.
- **Mes séances** : liste des séances (filtrée par moniteur assigné, ou complète pour un administrateur).
- **Écran de présence** : compteurs en direct (attendus / présents / absents / en retard / à traiter) et, pour chaque enfant, les actions **Arrivée**, **Absent**, **Excusé**, **Départ**.
- **Retard automatique** : jamais saisi à la main. Le système compare l'heure d'arrivée au seuil configuré de la séance.
- **Clôture protégée** : si des enfants sont encore marqués présents, la clôture affiche un avertissement explicite et exige une confirmation ; aucune heure de départ n'est jamais inventée.
- **Anomalies** : détectées automatiquement (enfant encore présent après la fin, séance non clôturée) ou déclarées lors d'une correction, avec possibilité de résolution par un administrateur.
- **Historique** : chaque évènement de présence est conservé ; une correction ajoute un évènement `CORRECTION` avec l'ancienne valeur, la nouvelle valeur et le motif — rien n'est jamais réécrit silencieusement.

## Stack

| Choix | Justification |
|---|---|
| Next.js (App Router) + React + TypeScript | Server Components pour les lectures, Server Actions pour les mutations, sans couche API séparée à maintenir pour un MVP. |
| Tailwind CSS | Design system par tokens, cohérent avec la charte Sun’s Horizons, sans bibliothèque de composants lourde. |
| Supabase (Postgres + Auth + RLS) | Auth prête à l'emploi et RLS pour un modèle multi-tenant dès le premier jour — schéma déjà écrit, voir [Modèle de données](#modèle-de-données). |
| Vitest | Tests rapides pour la logique métier (machine à états, classification des retards, détection d'anomalies). |

Aucune dépendance n'a été ajoutée sans raison : pas de gestionnaire d'état global, pas de bibliothèque de formulaires, pas de client GraphQL.

## Architecture

```
src/
  app/
    (auth)/login/          Connexion (formulaire réel ou démo selon la configuration)
    (app)/                 Zone connectée : dashboard, sessions, historique, anomalies
  components/
    ui/                    Boutons, cartes, états vides — primitives génériques
    auth/                  Formulaire de connexion réel + options de connexion démo
    brand/                 Identité visuelle Sun’s Horizons
  features/
    attendance/
      domain/              Logique pure : transitions, classification du retard, anomalies
      application/         Commandes et requêtes qui orchestrent le domaine + le stockage
      ui/                  Composants d'écran (roster, clôture, badges, actions serveur)
  server/
    demo/                  Jeu de données en mémoire (V0.1, voir ci-dessous)
  lib/
    auth/                  Session courante (démo ou Supabase), garde d'accès par rôle
    supabase/               Clients Supabase (navigateur, serveur, proxy de session)
    env.ts, format.ts, utils.ts
supabase/
  migrations/               Schéma Postgres complet (RLS incluse)
```

C'est une **architecture monolithique modulaire** : un seul déploiement, mais des frontières nettes (`domain` ne connaît ni la base de données ni React ; `application` orchestre ; `ui` ne contient pas de règles métier). Elle est prête à évoluer vers une API, une app mobile ou des QR codes plus tard, sans réécriture.

## Mode démo vs mode réel

La V0.1 doit pouvoir être démontrée **sans configuration cloud**. Tant que les variables Supabase ne sont pas renseignées, l'application :

- utilise un jeu de données réaliste en mémoire (`src/server/demo`), régénéré à chaque démarrage du serveur ;
- authentifie via deux comptes de démonstration (cookie de session signé, pas de mot de passe) au lieu de Supabase Auth.

Dès que `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont renseignées, l'application bascule automatiquement sur l'authentification Supabase réelle (le formulaire email/mot de passe déjà écrit) — c'est le même code, pas un mode séparé à maintenir. Les données réelles (groupes, enfants, séances) restent à brancher en Phase 2 (voir [Roadmap](#roadmap)) : le schéma et les policies RLS sont déjà prêts pour ça.

## Démarrage

1. Installer Node.js LTS.
2. `npm install`
3. `npm run dev`
4. Ouvrir `http://localhost:3000` et se connecter avec l'un des deux comptes de démonstration affichés.

Pour passer en mode réel : copier `.env.example` vers `.env.local`, renseigner les variables Supabase, puis appliquer `supabase/migrations/20260824120000_foundation.sql` dans le SQL Editor Supabase (voir `supabase/README.md`).

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Modèle de données

`attendance_events` est la source de vérité : chaque arrivée, absence, départ ou correction y ajoute une ligne immuable (jamais de suppression ni de réécriture). `attendance_records` est une projection reconstructible de l'état courant, utilisée pour un affichage rapide du roster. `occurred_at` (moment réel de l'évènement) est toujours distinct de `recorded_at` (moment de la saisie) ; tout est stocké en UTC et affiché en `Europe/Brussels`.

Entités : `organizations`, `profiles`, `organization_memberships`, `groups`, `children`, `group_enrollments`, `sessions`, `session_monitors`, `session_participants`, `attendance_records`, `attendance_events`, `audit_logs`, `anomalies`. Détails et policies RLS dans `supabase/migrations/20260824120000_foundation.sql`.

## Rôles

- **MONITOR** : voit uniquement ses séances assignées et leur roster ; enregistre arrivées, absences, excuses, départs, corrections.
- **ADMIN** : vision globale (toutes les séances, tous les groupes), anomalies, historique complet, résolution des anomalies de correction.

Un moniteur qui tente d'accéder à une séance qui ne lui est pas assignée reçoit une page introuvable (pas une page d'erreur qui confirmerait l'existence de la séance).

## Workflow de présence

```
EXPECTED → PRESENT (via ARRIVE, classification ON_TIME/LATE automatique)
EXPECTED → ABSENT
EXPECTED → EXCUSED
ABSENT   → PRESENT
EXCUSED  → PRESENT
PRESENT  → LEFT (via DEPART)
```

Toute autre transition (par exemple `LEFT → PRESENT`) est refusée comme action normale ; seule une **correction explicite**, motivée et tracée, peut modifier un évènement déjà enregistré — y compris sur une séance déjà clôturée.

## Tests

`npm test` couvre la logique métier avec Vitest : transitions autorisées/refusées, classification automatique du retard selon le seuil de la séance, détection des enfants encore présents après la fin d'une séance et des séances non clôturées, création d'une trace de correction sans perte de la valeur précédente, clôture bloquée puis débloquée par confirmation explicite, et cloisonnement des séances par moniteur.

## Limites connues de la V0.1

- Les groupes, enfants et séances sont des données de démonstration en mémoire, pas encore persistées dans Supabase (le schéma est prêt, le branchement est en Phase 2).
- Pas de mode hors-ligne réel.
- Pas d'import CSV, pas de QR code, pas de notifications — volontairement hors périmètre pour cette première version (voir Roadmap).

## Roadmap

- **Phase 2** — import CSV, vrais groupes et enfants, vrai planning, gestion des moniteurs (branchement du schéma Supabase déjà écrit).
- **Phase 3** — QR code, notifications, exports, statistiques, rapports.
- **Phase 4** — application mobile, mode hors-ligne, synchronisation.
- **Phase 5** — intelligence avancée : prédiction des absences, détection de tendances, recommandations.
