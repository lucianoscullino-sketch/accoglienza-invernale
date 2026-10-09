-- Aggiorna i 3 utenti demo da Bologna a Modena (rieseguibile).
update public.service_users
set description = replace(description, 'piazza Maggiore', 'piazza Grande'),
    lat = test.lat, lng = test.lng
from (values
  ('Marco', 44.6468, 10.9254),
  ('Yusuf', 44.6461, 10.9220),
  ('Anna', 44.6566, 10.9281)
) as test(name, lat, lng)
where service_users.name = test.name;

update public.service_users
set description = replace(description, 'via Zamboni', 'via Emilia')
where name = 'Yusuf';

update public.service_users
set description = replace(description, 'stazione centrale', 'stazione FS')
where name = 'Anna';

-- Aggiorna le eventuali proposte/verifiche demo rimaste a Bologna
-- (sposta tutto ciò che è fuori Modena-centro verso piazza Grande).
update public.service_users
set lat = 44.6468, lng = 10.9254
where active and (lat < 44.60 or lat > 44.70 or lng < 10.88 or lng > 10.97);

update public.proposals
set lat = 44.6468, lng = 10.9254
where status = 'pending' and (lat < 44.60 or lat > 44.70 or lng < 10.88 or lng > 10.97);
