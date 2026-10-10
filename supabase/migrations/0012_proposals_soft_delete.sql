-- Ripara/garantisce lo schema per l'eliminazione (soft-delete) delle proposte
-- da parte del coordinamento. Idempotente: eseguibile più volte.
-- Sintomo risolto: se la migrazione 0007 non è stata applicata, l'UPDATE di
-- deleteProposalAdmin (che scrive suspended/suspension_note) fallisce con
-- "column does not exist" e la proposta NON viene eliminata.

-- Colonne di sospensione sulle proposte (come 0007, idempotenti).
alter table public.proposals
  add column if not exists suspended boolean not null default false;
alter table public.proposals
  add column if not exists suspension_note text not null default '';

-- Helper (come 0011, idempotente).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Il coordinamento gestisce tutte le proposte: garantisce le policy admin.
drop policy if exists "proposals admin update" on public.proposals;
create policy "proposals admin update"
  on public.proposals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "proposals admin delete" on public.proposals;
create policy "proposals admin delete"
  on public.proposals for delete to authenticated
  using (public.is_admin());
