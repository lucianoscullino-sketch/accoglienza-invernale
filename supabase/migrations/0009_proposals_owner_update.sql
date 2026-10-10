-- Correzione dei testi di una proposta (refusi su nome/descrizione):
-- il Coordinamento può modificare qualsiasi proposta (già consentito dalla
-- policy "proposals admin update" di 0001); l'associazione può modificare
-- solo la propria proposta ancora in attesa.
-- Idempotente: si può eseguire più volte senza errori.

drop policy if exists "proposals owner update" on public.proposals;
create policy "proposals owner update"
  on public.proposals for update to authenticated
  using (status = 'pending' and proposed_by = public.my_org())
  with check (status = 'pending' and proposed_by = public.my_org());
