-- 0014_stops.sql
-- Entità Tappa (stop): 1:N con Utenti (service_users) e Candidati (proposals).
-- Un candidato può esistere senza tappa (stop_id null) finché non validato;
-- la validazione può assegnarlo a una tappa esistente o crearne una colocata.

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- FK: se una tappa viene eliminata (soft-delete su status), utenti e candidati
-- restano con stop_id = null (non vengono cancellati).
alter table public.service_users
  add column stop_id uuid references public.stops (id) on delete set null;

alter table public.proposals
  add column stop_id uuid references public.stops (id) on delete set null;

create index stops_status_idx on public.stops (status);
create index service_users_stop_id_idx on public.service_users (stop_id);
create index proposals_stop_id_idx on public.proposals (stop_id);

-- RLS: lettura aperta a tutti gli autenticati, scrittura solo coordinamento.
alter table public.stops enable row level security;

create policy "stops select"
  on public.stops for select
  to authenticated
  using (true);

create policy "stops admin write"
  on public.stops for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );