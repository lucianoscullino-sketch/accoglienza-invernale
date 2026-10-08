-- Accoglienza Invernale — schema iniziale
-- Da eseguire nell'SQL Editor di Supabase (o con `supabase db push`).
-- Crea tabelle, RLS e trigger per i profili.

create extension if not exists pgcrypto;

-- Associazioni che escono sul territorio
create table public.organizations (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Profili degli utenti autenticati: un'associazione oppure il coordinamento (admin).
-- org_id può essere null: il profilo resta in sola consultazione finché
-- l'amministratore non assegna un'associazione (non blocca la creazione utenti).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'org' check (role in ('admin', 'org')),
  org_id text references public.organizations (id),
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- Helper per le policy (security definer: leggono i profili senza dare letture dirette)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_org()
returns text language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Anagrafica degli utenti senza dimora geolocalizzati
create table public.service_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Esito serale, firmato dall'associazione che è uscita
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.service_users (id) on delete cascade,
  date date not null,
  org_id text not null default 'admin',
  found boolean not null,
  provided text[] not null default '{}',
  requested text not null default '',
  note text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index daily_logs_date_idx on public.daily_logs (date);
create index daily_logs_user_idx on public.daily_logs (user_id);

-- Proposte di nuovi utenti: restano visibili 7 giorni, poi scadono
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  proposed_by text not null,
  status text not null default 'pending' check (status in ('pending', 'validated', 'rejected')),
  validated_into uuid references public.service_users (id),
  created_at timestamptz not null default now()
);
create index proposals_status_idx on public.proposals (status);

-- Visite in campo su una proposta, firmate come gli esiti regolari
create table public.proposal_verifications (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  date date not null,
  org_id text not null default 'admin',
  found boolean not null,
  provided text[] not null default '{}',
  requested text not null default '',
  note text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (proposal_id, date)
);
create index proposal_verifications_date_idx on public.proposal_verifications (date);

-- Eccezioni al calendario per una singola sera.
-- Riga assente = vale la regola fissa; org_id null = nessuna uscita.
create table public.calendar_overrides (
  date date primary key,
  org_id text references public.organizations (id)
);

-- Calendario fisso settimanale + ordine dei sabati a turno
create table public.settings (
  id text primary key default 'main',
  weekly jsonb not null default '{"0":"o1","1":"o1","2":"o0","3":"o2","4":"o3","5":"o4"}'::jsonb,
  sat jsonb not null default '{"order":["o0","o1","o2","o3","o4"],"start":"2026-10-03"}'::jsonb
);

-- Crea automaticamente il profilo quando viene creato un utente auth.
-- Non deve mai bloccare la creazione: se i metadata sono incompleti o l'org_id
-- non esiste, il profilo viene creato in sola consultazione (org_id null).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'org');
  v_org  text := nullif(new.raw_user_meta_data ->> 'org_id', '');
  v_name text := coalesce(new.raw_user_meta_data ->> 'display_name', '');
begin
  if v_role not in ('admin', 'org') then v_role := 'org'; end if;
  if v_role = 'admin' then v_org := null; end if;
  begin
    insert into public.profiles (id, role, org_id, display_name)
    values (new.id, v_role, v_org, v_name);
  exception when foreign_key_violation then
    raise warning 'handle_new_user: org_id "%" inesistente, profilo in sola consultazione', v_org;
    insert into public.profiles (id, role, org_id, display_name)
    values (new.id, 'org', null, v_name)
    on conflict (id) do nothing;
  end;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.service_users enable row level security;
alter table public.daily_logs enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_verifications enable row level security;
alter table public.calendar_overrides enable row level security;
alter table public.settings enable row level security;

create policy "orgs select" on public.organizations for select to authenticated using (true);
create policy "orgs admin write" on public.organizations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "profiles select" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users select" on public.service_users for select to authenticated using (true);
create policy "users admin insert" on public.service_users for insert to authenticated with check (public.is_admin());
create policy "users admin update" on public.service_users for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users admin delete" on public.service_users for delete to authenticated using (public.is_admin());

create policy "logs select" on public.daily_logs for select to authenticated using (true);
create policy "logs insert" on public.daily_logs for insert to authenticated with check (public.is_admin() or org_id = public.my_org());
create policy "logs update" on public.daily_logs for update to authenticated using (public.is_admin() or org_id = public.my_org()) with check (public.is_admin() or org_id = public.my_org());
create policy "logs delete" on public.daily_logs for delete to authenticated using (public.is_admin());

create policy "proposals select" on public.proposals for select to authenticated using (true);
create policy "proposals insert" on public.proposals for insert to authenticated with check (public.is_admin() or proposed_by = public.my_org());
create policy "proposals admin update" on public.proposals for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "proposals admin delete" on public.proposals for delete to authenticated using (public.is_admin());

create policy "verifs select" on public.proposal_verifications for select to authenticated using (true);
create policy "verifs insert" on public.proposal_verifications for insert to authenticated with check (public.is_admin() or org_id = public.my_org());
create policy "verifs update" on public.proposal_verifications for update to authenticated using (public.is_admin() or org_id = public.my_org()) with check (public.is_admin() or org_id = public.my_org());
create policy "verifs delete" on public.proposal_verifications for delete to authenticated using (public.is_admin());

create policy "cal select" on public.calendar_overrides for select to authenticated using (true);
create policy "cal admin write" on public.calendar_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "settings select" on public.settings for select to authenticated using (true);
create policy "settings admin write" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

