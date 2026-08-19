# Sunu Papier — Frontends + API

Trois applications React + Vite indépendantes :

- `citoyen/` — parcours citoyen, téléphone/PIN, accueil, mes papiers, mon compte.
- `administrateur/` — thème rouge, dashboard, création de délégués, maisons de chef de quartier, documents administratifs.
- `delegue/` — thème bleu, dashboard, demandes reçues, contrôle de quartier, fiche citoyen et envoi simulé du certificat.

## Lancer une application

```bash
cd administrateur
npm install
npm run dev
```

Même principe pour `delegue` et `citoyen`.

## Important

## Backend et base de données

Le dossier `backend/` contient l'API REST partagée, connectée à Supabase. L'authentification est assurée par Supabase Auth, les routes sont protégées par rôle (`admin`, `delegate`, `citizen`) et les fichiers sont enregistrés dans Supabase Storage.

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

L'API est disponible sur `http://localhost:4000/api`. Elle utilise le projet Supabase configuré dans `backend/.env`.

Compte administrateur initial : `admin@sunupapier.sn` / `Admin@2026`. Changez impérativement le mot de passe et `JWT_SECRET` dans `.env` avant une mise en production.

Principales routes :

- `POST /api/auth/citizen/register` et `POST /api/auth/login`
- `GET /api/me` et `PUT /api/me/citizen`
- `GET|POST /api/admin/delegates` et `GET|POST /api/admin/houses`
- `GET /api/houses`, `POST /api/requests`, `GET /api/requests/mine`
- `GET /api/delegate/requests` et `PATCH /api/delegate/requests/:id`

Envoyez le jeton reçu à la connexion dans l'en-tête `Authorization: Bearer <token>`.

```bash
npm test
```

Note : l'OCR automatique de la CNI n'est pas simulé. L'API affecte aujourd'hui une demande à la maison/quartier explicitement sélectionné par le citoyen ; un fournisseur OCR pourra être branché ultérieurement sans modifier le modèle de données.

## Préparation Supabase

Une migration PostgreSQL/Supabase complète est disponible dans `supabase/migrations/202608170001_initial_schema.sql`. Consultez `supabase/README.md` pour l’exécuter, créer le premier administrateur et configurer les variables d’environnement.
# sunu-papiers
