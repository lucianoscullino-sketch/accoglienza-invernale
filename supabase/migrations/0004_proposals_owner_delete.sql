-- Le associazioni possono cancellare definitivamente le proprie proposte
-- ancora in attesa (es. create per errore). Admin invariato (policy esistente).
-- Idempotente: si può eseguire più volte senza errori.

-- Assicura che l'helper esista (in alcuni DB creati a mano potrebbe mancare).
create or replace function public.my_org()
returns text language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

drop policy if exists "proposals owner delete" on public.proposals;
create policy "proposals owner delete"
  on public.proposals for delete to authenticated
  using (status = 'pending' and proposed_by = public.my_org());