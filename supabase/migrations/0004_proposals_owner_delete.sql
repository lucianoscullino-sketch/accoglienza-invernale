-- Le associazioni possono cancellare definitivamente le proprie proposte
-- ancora in attesa (es. create per errore). Admin invariato (policy esistente).
create policy "proposals owner delete"
  on public.proposals for delete to authenticated
  using (status = 'pending' and proposed_by = public.my_org());