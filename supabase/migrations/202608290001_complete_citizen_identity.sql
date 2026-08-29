alter table public.citizen_profiles
  add column if not exists birth_date date,
  add column if not exists birth_place text not null default '',
  add column if not exists identity_number text not null default '',
  add column if not exists villa_number text not null default '';

comment on column public.citizen_profiles.villa_number is
  'Numéro de villa ou de lot renseigné par le citoyen et repris sur le certificat.';
