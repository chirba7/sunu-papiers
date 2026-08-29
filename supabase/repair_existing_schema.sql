-- Correction si une ancienne table document_requests existe sans citizen_id.
-- L'ancienne table est conservee sous un nom *_legacy, jamais supprimee.

do $$
declare
  legacy_name text := 'document_requests_legacy_' || to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
begin
  if to_regclass('public.document_requests') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'document_requests'
         and column_name = 'citizen_id'
     ) then
    execute format('alter table public.document_requests rename to %I', legacy_name);
    raise notice 'Ancienne table renommee en public.%', legacy_name;
  end if;
end;
$$;

-- Vérification : cette requête ne doit retourner aucune ligne après avoir
-- réexécuté la migration principale.
select 'document_requests.citizen_id manquante' as probleme
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'document_requests'
    and column_name = 'citizen_id'
);
