-- Sospensione / eliminazione definitiva di utenze e proposte (solo coordinamento).
-- Sospendere = nascosto da mappa ed elenchi ma il record resta (reversibile).
-- Eliminare  = riga cancellata definitivamente (esiti/verifiche via cascade).
-- Idempotente: si può eseguire più volte senza errori.

-- Per le utenze basta la colonna active (già presente): active=false = sospeso.
-- Questa colonna serve solo a registrare il motivo della sospensione.
alter table public.service_users
  add column if not exists suspension_note text not null default '';

-- Per le proposte serve un flag esplicito: le sospese escono da mappa ed
-- elenchi ma restano pendenti nel DB (possono essere riattivate).
alter table public.proposals
  add column if not exists suspended boolean not null default false;
alter table public.proposals
  add column if not exists suspension_note text not null default '';
