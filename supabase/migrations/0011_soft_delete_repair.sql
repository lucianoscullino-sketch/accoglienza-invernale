-- Ripara/garantisce lo schema per sospensione ed eliminazione (soft-delete)
-- delle utenze da parte del coordinamento. Idempotente: eseguibile più volte.
-- Risolve il caso in cui le migrazioni 0007/0008/0010 non siano state applicate
-- sul DB di produzione (in quel caso l'UPDATE di deleteUser tocca 0 righe e
-- l'eliminazione sembra non avere effetto).

-- Colonne di stato (idempotenti).
alter table public.service_users
  add column if not exists active boolean not null default true;
alter table public.service_users
  add column if not exists suspension_note text not null default '';
alter table public.service_users
  add column if not exists deleted boolean not null default false;
alter table public.service_users
  add column if not exists created_by_org text references public.organizations (id);

-- Helper (idempotenti).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_org()
returns text language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Guardia anti-escalation (idempotente): le associazioni non possono cambiare
-- stato/ownership/proprietario né il motivo di sospensione. L'admin passa sempre.
create or replace function public.service_users_owner_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return NEW;
  end if;
  if NEW.active is distinct from OLD.active
     or NEW.deleted is distinct from OLD.deleted
     or NEW.created_by_org is distinct from OLD.created_by_org
     or NEW.suspension_note is distinct from OLD.suspension_note then
    raise exception 'Solo il coordinamento può cambiare stato o proprietario di un utente';
  end if;
  return NEW;
end; $$;

drop trigger if exists service_users_owner_guard on public.service_users;
create trigger service_users_owner_guard
  before update on public.service_users
  for each row execute function public.service_users_owner_guard();

-- Policy: il coordinamento ha il pieno controllo delle utenze (CRUD).
drop policy if exists "users select" on public.service_users;
create policy "users select" on public.service_users for select to authenticated using (true);

drop policy if exists "users admin insert" on public.service_users;
create policy "users admin insert" on public.service_users for insert to authenticated with check (public.is_admin());

drop policy if exists "users admin update" on public.service_users;
create policy "users admin update" on public.service_users for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "users admin delete" on public.service_users;
create policy "users admin delete" on public.service_users for delete to authenticated using (public.is_admin());

-- Policy owner: le associazioni correggono solo le utenze da loro create.
drop policy if exists "users owner update" on public.service_users;
create policy "users owner update"
  on public.service_users for update to authenticated
  using (created_by_org is not null and created_by_org = public.my_org())
  with check (created_by_org is not null and created_by_org = public.my_org());

-- FK proposals.validated_into → on delete cascade: evita che un'eliminazione
-- fisica (se mai usata) fallisca per vincolo. Ricrea il constraint con cascade.
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'proposals'
      and con.contype = 'f'
      and con.confrelid = 'public.service_users'::regclass
      and con.conkey[1] = (
        select att.attnum from pg_attribute att
        where att.attrelid = con.conrelid and att.attname = 'validated_into'
      )
  loop
    execute format('alter table public.proposals drop constraint %I', r.conname);
  end loop;
  alter table public.proposals
    add constraint proposals_validated_into_fkey
    foreign key (validated_into) references public.service_users(id) on delete cascade;
end $$;
