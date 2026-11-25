# Accoglienza invernale

Web app per il coordinamento delle uscite serali di unità di strada verso persone senza dimora.
Mappa degli utenti e delle tappe, registrazione degli esiti da parte dell'associazione in turno,
calendario delle uscite, report Excel e invio automatico del report a fine turno.

Stagione corrente: **2026-27** (uscite fino al 30 marzo 2027).

## Stack

- **Next.js** (App Router, TypeScript), pubblicato su **Vercel** (piano Hobby)
- **Supabase**: autenticazione, database Postgres con RLS, `pg_cron` e `pg_net`
- **Google Apps Script**: spedisce le email del report (nessuna password di casella sul server)
- Libreria `xlsx` per i file Excel, generati nel browser e sul server

## Ruoli

| Ruolo | Cosa può fare |
|---|---|
| **Coordinamento** (`admin`) | Gestisce utenti, tappe, proposte, calendario, avvisi, account e report. Non fa uscite: non registra esiti serali. Può correggere i beni di una tappa. |
| **Associazione** (`org`) | Vede mappa ed elenchi. Scrive solo se è l'associazione in turno nel giorno di servizio corrente. Vede il proprio report. |

La sicurezza reale è nelle policy RLS di Supabase: i controlli `canWrite` e `isActiveOrg` dell'app sono solo di comodo.

## Giorno di servizio e turni

- Il **giorno di servizio** va dalle **20:00 alle 20:00** (ora di Roma), non da mezzanotte.
- Fino alle 20:00 scrivono il coordinamento e l'associazione uscita la sera prima; dalle 20:00 tocca a quella in turno stasera.
- Il turno segue una regola fissa (giorni della settimana e sabati a rotazione, tabella `settings`) con eccezioni per data nel calendario.
- Alle 20:00 le tappe tornano "da servire" (vedi job `reset stato tappe`).

## Funzioni principali

- **Utenti e tappe**: ogni utente appartiene a una tappa. Gli utenti **multipli** (ad esempio famiglie) hanno il campo *Utenti trovati (N)*, salvato in `daily_logs.users_found`.
- **Esito serale** (`daily_logs`): trovato o no, cosa è stato fornito, richiesto, note importanti, note uscita. Una riga per utente e giorno.
- **Esito di tappa** (`stop_logs`): servita o no, sacchi a pelo, coperte. Una riga per tappa e giorno. `org_id` nullo = inserito dal coordinamento.
- **Proposte**: le associazioni propongono nuove tappe (stato `pending`) che il coordinamento valida. Resta la gestione delle proposte utente storiche.
- **Avvisi**: messaggi del coordinamento mostrati nel briefing all'accesso.
- **Fine stagione**: cancellazione dei dati personali (popup per il coordinamento dal 30 marzo 2027, job automatico il 30 aprile).

## Report

- **Il tuo report** (associazioni): riepilogo della serata scelta (contatti, persone trovate, tappe, sacchi a pelo, coperte) e pulsante per scaricare l'Excel. Il dettaglio per tappa e utente è nel file.
- **Report** (coordinamento): filtri per periodo, giorno, associazione, tappa, utente; includibili utenti sospesi, eliminati e proposte; esportazione CSV o Excel.
- **Struttura del file Excel**: Data, Associazione, Tappa, Esito tappa, Sacchi a pelo, Coperte, Nickname, Trovato, Utenti trovati, Fornito, Richiesto, Note importanti, Note uscita, Proposta. Le celle ripetute (data, associazione, tappa e beni) sono unite per colonna e la larghezza è automatica. Esito tappa e beni compaiono una sola volta per tappa, così le somme non si duplicano.

### Invio del report a fine turno

1. **Dall'associazione**: all'uscita dall'app (pulsante *Esci* o tasto Indietro) l'associazione in turno può scegliere *Genera e invia report ed esci*. La route `send_report` spedisce la mail e registra la serata in `report_sends`.
2. **Automatico**: il job `auto-send-report-hourly` chiama ogni ora `/api/admin/report/auto-send`. La route invia solo tra l'ora `autoReportHour` (scelta dal coordinamento nel menu *Invio auto-report*, da 8 a 19) e le 20:00 di Roma, e solo se la serata non risulta già in `report_sends`. L'invio viene "prenotato" prima di spedire e rilasciato in caso di errore, così non partono due mail.
3. Il destinatario è deciso dallo script Apps Script (proprietà `REPORT_TO`), non dal codice.

Prova manuale di un invio: `/api/admin/report/auto-send?date=AAAA-MM-GG` con header `Authorization: Bearer <CRON_SECRET>` (salta il controllo dell'orario e invia davvero).

## Database

Tabelle principali: `profiles`, `organizations`, `service_users`, `daily_logs`, `stops`, `stop_logs`, `proposals`, `notices`, `settings`, `report_sends`, più le eccezioni del calendario.

Modifiche recenti da avere applicate:

```sql
-- serata già inviata (usata dal job automatico)
create table if not exists report_sends (
  outing_date date primary key,
  sent_by uuid,
  org_id uuid,
  sent_at timestamptz not null default now()
);
alter table report_sends enable row level security;  -- nessuna policy: solo service-role

-- ora di invio automatico scelta dal coordinamento
alter table settings add column if not exists "autoReportHour" integer not null default 16;

-- beni di tappa inseribili anche dal coordinamento
alter table stop_logs alter column org_id drop not null;
```

### Job `pg_cron`

| Job | Orario (UTC) | Cosa fa |
|---|---|---|
| `reset stato tappe` | `1 18,19 * * *` | `reset_served_stops()`: azzera `served_at` solo quando a Roma sono le 20 (gestisce l'ora legale) |
| `purge-season-auto` | `0 2 30 4 *` | `purge_season_auto()`: cancellazione di fine stagione |
| `auto-send-report-hourly` | `2 * * * *` | `net.http_get` verso `/api/admin/report/auto-send` con `Authorization: Bearer <CRON_SECRET>` |

Controlli utili:

```sql
select jobid, jobname, schedule, active from cron.job;
select id, status_code, content, created from net._http_response order by id desc limit 5;
```

Il segreto compare in chiaro in `cron.job.command`: l'accesso al database va tenuto ristretto.

## API

| Route | Chi | Scopo |
|---|---|---|
| `POST /api/admin/account` | solo coordinamento | crea account di associazioni e cambia l'email di accesso |
| `POST /api/admin/account/send_report` | qualsiasi utente con profilo | invia il report della serata e la registra in `report_sends` |
| `GET /api/admin/report/auto-send` | `CRON_SECRET` | invio automatico del report |

## Variabili d'ambiente (Vercel)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, `CRON_SECRET`.

`vercel.json` è vuoto (`{}`): sul piano Hobby i cron di Vercel non possono girare ogni ora, quindi la schedulazione è su Supabase.

## Sviluppo

```bash
npm install
npm run dev      # sviluppo locale
npm run build    # stesso controllo dei tipi di Vercel: da lanciare prima del push
```

Il deploy parte dal push su Git. Salvare i file in locale non basta.

## Caricamento dati

L'app legge `daily_logs` e `stop_logs` a blocchi da 1000 righe (`fetchAll`), perché Supabase non ne restituisce di più per richiesta.

## Note e limiti noti

- Le funzioni `mark_stop_served` e `reset_stop_served` e le policy di `stop_logs` non verificano il turno: lo fa solo l'app.
- `send_report` accetta il file dal client: controlla solo nome ed estensione.
- Il report contiene dati riservati: va trattato come tale (non inoltrare, cancellare dopo l'uso).
- `validate()` (validazione di una proposta) esegue più scritture non atomiche; da valutare una funzione RPC.
