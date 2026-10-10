-- Soft-delete delle utenze: "eliminare" dal coordinamento nasconde la riga
-- (deleted=true, active=false) invece di cancellarla, così il coordinatore può
-- ancora rivedere gli eliminati su mappa attivando l'apposito flag e, se serve,
-- ripristinarli. Idempotente.

alter table public.service_users
  add column if not exists deleted boolean not null default false;
