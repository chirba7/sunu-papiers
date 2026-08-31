-- Le certificat n'est plus calqué sur un PDF importé : chaque maison déclare les
-- champs qu'elle attend, et le numéro de dossier repart à 001 pour chaque délégué.

-- 1. Configuration du certificat, portée par la maison ------------------------

alter table public.houses
  alter column certificate_path drop not null;

alter table public.houses
  add column if not exists certificate_fields jsonb not null
    default '["birth_date","birth_place","identity_type","identity_number","address","resident_since","lot_number"]'::jsonb,
  add column if not exists seal_path text;

comment on column public.houses.certificate_fields is
  'Liste ordonnée des champs imprimés sur le certificat. Clés reconnues par backend/src/certificate.js : birth_date, birth_place, parents, identity_type, identity_number, address, resident_since, lot_number.';
comment on column public.houses.seal_path is
  'Image unique signature + cachet du délégué, apposée en bas à droite du certificat.';
comment on column public.houses.certificate_path is
  'Ancien modèle PDF. Conservé pour les maisons créées avant le 31/08/2026 : sert de repli pour la zone signature tant qu''aucun seal_path n''est renseigné.';

alter table public.houses
  add constraint houses_certificate_fields_is_array
  check (jsonb_typeof(certificate_fields) = 'array')
  not valid;

-- 2. Compteur de dossiers par délégué ----------------------------------------

alter table public.document_requests
  add column if not exists delegate_sequence integer;

comment on column public.document_requests.delegate_sequence is
  'Numéro de dossier imprimé sur le certificat, propre à chaque délégué et reparti à 1 pour un nouveau délégué.';

create table if not exists public.delegate_counters (
  delegate_id uuid primary key references public.profiles(id) on delete cascade,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.delegate_counters enable row level security;

-- Incrément atomique : deux demandes simultanées ne peuvent pas obtenir le même
-- numéro, contrairement à un « select max(...) + 1 ».
create or replace function public.next_delegate_number(target uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare attributed integer;
begin
  insert into public.delegate_counters as counter (delegate_id, last_number)
  values (target, 1)
  on conflict (delegate_id) do update
    set last_number = counter.last_number + 1, updated_at = now()
  returning counter.last_number into attributed;
  return attributed;
end;
$$;

-- Normalise « AÏNOUMADY 03 » en « AINOUMADY03 » pour la référence.
-- translate() plutôt que unaccent : l'extension n'est pas garantie.
create or replace function public.slugify_quartier(value text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(
      regexp_replace(
        upper(translate(coalesce(value, ''),
          'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
          'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')),
        '[^A-Z0-9]', '', 'g'),
      ''),
    'QUARTIER');
$$;

create or replace function public.prepare_document_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  selected_house public.houses%rowtype;
  attributed integer;
begin
  select * into selected_house from public.houses where id = new.house_id and active;
  if not found then raise exception 'Maison introuvable ou archivee'; end if;
  if selected_house.delegate_id is null then raise exception 'Aucun delegue affecte a cette maison'; end if;
  new.delegate_id := selected_house.delegate_id;
  attributed := public.next_delegate_number(new.delegate_id);
  new.delegate_sequence := attributed;
  new.reference := 'CD-'
    || public.slugify_quartier(selected_house.quartier) || '-'
    || extract(year from now() at time zone 'Africa/Dakar')::integer || '-'
    || lpad(attributed::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists document_request_prepare on public.document_requests;
create trigger document_request_prepare before insert on public.document_requests
for each row execute function public.prepare_document_request();

-- 3. Reprise des demandes existantes -----------------------------------------
-- Les références déjà émises ne sont pas réécrites : des certificats envoyés les
-- portent. Seul delegate_sequence est rempli, dans l'ordre de dépôt.

with ordered as (
  select id,
         row_number() over (partition by delegate_id order by submitted_at, id) as position
  from public.document_requests
  where delegate_id is not null
)
update public.document_requests as target
set delegate_sequence = ordered.position
from ordered
where target.id = ordered.id and target.delegate_sequence is null;

insert into public.delegate_counters (delegate_id, last_number)
select delegate_id, max(delegate_sequence)
from public.document_requests
where delegate_id is not null and delegate_sequence is not null
group by delegate_id
on conflict (delegate_id) do update
  set last_number = greatest(public.delegate_counters.last_number, excluded.last_number),
      updated_at = now();
