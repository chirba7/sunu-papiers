# Installation Supabase - Sunu Papiers

## 1. Exécuter la migration

Dans le Dashboard Supabase, ouvrez **SQL Editor**, créez une nouvelle requête, copiez tout le contenu de `migrations/202608170001_initial_schema.sql`, puis cliquez sur **Run**.

La migration crée :

- les profils liés à `auth.users` ;
- les profils citoyens ;
- les maisons de quartier avec archivage logique ;
- les demandes et leur numéro automatique `CD-AAAA-0001` ;
- les règles RLS citoyen/délégué/admin ;
- trois buckets privés pour CNI, modèles et certificats.

### Erreur `column citizen_id does not exist`

Cette erreur indique qu'une ancienne table `public.document_requests` existe déjà avec une structure différente. Exécutez d'abord `repair_existing_schema.sql`. Le script renomme l'ancienne table en `document_requests_legacy_...` sans effacer ses données. Réexécutez ensuite la migration principale complète.

## 2. Créer le premier administrateur

Créez l’utilisateur dans **Authentication > Users**, puis remplacez l’e-mail et exécutez :

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
where email = 'votre-admin@domaine.sn';

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'votre-admin@domaine.sn');
```

## 3. Organisation de Storage

- `identity-documents/{citizen_uuid}/recto.jpg`
- `identity-documents/{citizen_uuid}/verso.jpg`
- `house-templates/{house_id}/modele.pdf`
- `generated-certificates/{citizen_uuid}/{reference}.pdf`

Les buckets sont privés. Utilisez des URL signées pour afficher ou télécharger les fichiers.

## 4. Variables à préparer

```env
SUPABASE_URL=https://VOTRE-PROJET.supabase.co
SUPABASE_ANON_KEY=votre_cle_publique
SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_serveur
```

Ne placez jamais `SUPABASE_SERVICE_ROLE_KEY` dans une application Vite ou dans du code envoyé au navigateur.

## Important

Cette migration est utilisée par le backend Node. Les comptes sont gérés par Supabase Auth, les données par PostgreSQL et les fichiers par Supabase Storage.
