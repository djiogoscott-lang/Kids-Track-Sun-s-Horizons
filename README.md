# Kids Track — Sun’s Horizons

Application SaaS de gestion des présences des enfants.

## Foundation

- Next.js 16.3 + React 19 + TypeScript
- Tailwind CSS
- Supabase Auth + PostgreSQL + Row Level Security
- RBAC : `ADMIN` / `MONITOR`
- Architecture modulaire sous `src/`
- Tests Vitest

## Lancer le projet

1. Installer Node.js LTS.
2. Installer les dépendances : `npm install`
3. Copier `.env.example` vers `.env.local`.
4. Renseigner les variables Supabase.
5. Appliquer `supabase/migrations/20260824120000_foundation.sql` dans le SQL Editor Supabase.
6. Lancer : `npm run dev`

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Périmètre volontairement limité

La Foundation ne contient pas encore les écrans ni les mutations de présence. Le domaine `EXPECTED → PRESENT/ABSENT/EXCUSED → LEFT`, les événements immuables, corrections, clôture et anomalies seront introduits après validation de cette base.
