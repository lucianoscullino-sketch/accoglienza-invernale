-- Avvisi (ex "segnalazioni") del coordinamento a TUTTE le associazioni.
-- L'avviso resta visibile negli account delle associazioni (banner in testata
-- al pannello, sotto i tab) finché il coordinamento non lo rimuove.
-- Idempotente: eseguibile più volte.

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(btrim(message)) > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists notices_created_at_idx on public.notices (created_at desc);

alter table public.notices enable row level security;

-- Helper (come 0011/0012, idempotente).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Tutti gli account autenticati (associazioni e coordinamento) leggono gli
-- avvisi; solo il coordinamento li pubblica e li rimuove.
drop policy if exists "notices select" on public.notices;
create policy "notices select"
  on public.notices for select to authenticated using (true);

drop policy if exists "notices admin insert" on public.notices;
create policy "notices admin insert"
  on public.notices for insert to authenticated with check (public.is_admin());

drop policy if exists "notices admin delete" on public.notices;
create policy "notices admin delete"
  on public.notices for delete to authenticated using (public.is_admin());