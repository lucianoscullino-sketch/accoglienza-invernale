-- Patch per database già creati con 0001_init.sql.
-- 1) Rimuove il vincolo che impediva la creazione di utenti senza org_id:
--    ora il profilo viene creato in sola consultazione e l'admin può
--    assegnare l'associazione in seguito (Table Editor → profiles → org_id).
-- 2) Rende il trigger resiliente a metadata mancanti/errati.

alter table public.profiles drop constraint if exists org_required;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'org');
  v_org  text := nullif(new.raw_user_meta_data ->> 'org_id', '');
  v_name text := coalesce(new.raw_user_meta_data ->> 'display_name', '');
begin
  if v_role not in ('admin', 'org') then v_role := 'org'; end if;
  if v_role = 'admin' then v_org := null; end if;
  begin
    insert into public.profiles (id, role, org_id, display_name)
    values (new.id, v_role, v_org, v_name);
  exception when foreign_key_violation then
    raise warning 'handle_new_user: org_id "%" inesistente, profilo in sola consultazione', v_org;
    insert into public.profiles (id, role, org_id, display_name)
    values (new.id, 'org', null, v_name)
    on conflict (id) do nothing;
  end;
  return new;
end; $$;

-- Profili creati in precedenza senza org_id (opzionale, allinea i ruoli dai metadata)
insert into public.profiles (id, role, org_id, display_name)
select u.id,
       case when u.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'org' end,
       null,
       coalesce(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
