-- Dati iniziali di esempio: associazioni, calendario fisso e tre utenti dimostrativi.
-- I tre utenti sono fittizi, attorno al centro di Bologna: eliminarli quando sei pronto.
-- Rieseguibile: gli insert sono protetti da "on conflict" / "not exists".

insert into public.organizations (id, name) values
  ('o0', 'Croce Blu'),
  ('o1', 'Croce Rossa'),
  ('o2', 'Protezione Civile'),
  ('o3', 'Agesci'),
  ('o4', 'Porta Aperta')
on conflict (id) do nothing;

insert into public.settings (id, weekly, sat) values (
  'main',
  '{"0":"o1","1":"o1","2":"o0","3":"o2","4":"o3","5":"o4"}'::jsonb,
  '{"order":["o0","o1","o2","o3","o4"],"start":"2026-10-03"}'::jsonb
) on conflict (id) do nothing;

insert into public.service_users (name, description, lat, lng)
select v.name, v.description, v.lat, v.lng
from (values
  ('Marco', 'Panchina lato nord di piazza Maggiore, vicino ai portici. Accetta volentieri tè caldo e coperte.', 44.49388, 11.34006),
  ('Yusuf', 'Sotto il portico di via Zamboni, all''angolo. Dorme con uno zaino blu, parla poco italiano.', 44.49490, 11.34633),
  ('Anna', 'Ingresso della stazione centrale, lato taxi. Ha un cane piccolo, chiede spesso coperte.', 44.50580, 11.34570)
) as v(name, description, lat, lng)
where not exists (
  select 1 from public.service_users s where s.name = v.name
);
