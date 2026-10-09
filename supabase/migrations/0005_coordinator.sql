-- Menu coordinatore (solo amministratore).
-- 1) Nota stabile del coordinamento su ogni utente, diversa dalle note serali
--    degli esiti. Visibile a tutti, modificabile solo dall'admin (già coperto da
--    "users admin update").
-- 2) Email sui profili, popolata dal trigger alla creazione: auth.users NON è
--    leggibile dal client con la chiave pubblica, quindi serve una copia per
--    riconoscere gli account quando il coordinatore assegna associazione/ruolo.
-- Idempotente: eseguibile più volte.

alter table public.service_users
  add column if not exists note text not null default '';

alter table public.profiles
  add column if not exists email text not null default '';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'org');
  v_org  text := nullif(new.raw_user_meta_data ->> 'org_id', '');
  v_name text := coalesce(new.raw_user_meta_data ->> 'display_name', '');
  v_mail text := coalesce(new.email, '');
begin
  if v_role not in ('admin', 'org') then v_role := 'org'; end if;
  if v_role = 'admin' then v_org := null; end if;
  begin
    insert into public.profiles (id, role, org_id, display_name, email)
    values (new.id, v_role, v_org, v_name, v_mail);
  exception when foreign_key_violation then
    raise warning 'handle_new_user: org_id "%" inesistente, profilo in sola consultazione', v_org;
    insert into public.profiles (id, role, org_id, display_name, email)
    values (new.id, 'org', null, v_name, v_mail)
    on conflict (id) do nothing;
  end;
  return new;
end; $$;

-- Allinea i profili già esistenti con l'email di auth.users (una sola volta).
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and coalesce(p.email, '') = '' and u.email is not null;
