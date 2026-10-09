-- Allinea lo schema di produzione allo schema delle migrazioni.
-- In alcuni database la tabella public.profiles è stata creata prima che
-- esistesse la colonna created_at, quindi "order by created_at" fallisce con
-- "column profiles.created_at does not exist" e il caricamento profili si blocca.
-- Aggiungiamo la colonna se manca e la popoliamo con un valore sensato.
-- Idempotente: eseguibile più volte.

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();
