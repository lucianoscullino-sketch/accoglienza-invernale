-- Modifica dati delle utenze da parte delle associazioni proponenti.
-- Coordinamento: invariato (policy "users admin update" di 0001).
-- Associazioni: possono correggere nome/descrizione/posizione/nota stabile
-- solo degli utenti da loro creati (tracciati in created_by_org).
-- Idempotente: eseguibile più volte senza errori.

alter table public.service_users
  add column if not exists created_by_org text references public.organizations (id);

-- Backfill: per gli utenti nati da una proposta validata, il proprietario
-- è l'associazione che aveva fatto la proposta.
update public.service_users u
set created_by_org = p.proposed_by
from public.proposals p
where p.validated_into = u.id
  and u.created_by_org is null
  and p.proposed_by is not null;

-- Assicura che l'helper esista (in alcuni DB creati a mano potrebbe mancare).
create or replace function public.my_org()
returns text language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Guardia anti-escalation: un'associazione non può cambiare stato/ownership
-- (active/deleted/created_by_org) né il motivo di sospensione, riservati al
-- coordinamento. Idempotente.
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

-- Policy owner: update solo sulle righe create dalla propria associazione.
-- Il trigger qui sopra limita comunque le colonne effettivamente modificabili.
drop policy if exists "users owner update" on public.service_users;
create policy "users owner update"
  on public.service_users for update to authenticated
  using (created_by_org is not null and created_by_org = public.my_org())
  with check (created_by_org is not null and created_by_org = public.my_org());
