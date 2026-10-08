# Accoglienza Invernale

Web app per il servizio di accoglienza invernale ai senza dimora: una **mappa** con gli utenti
geolocalizzati, gli **esiti serali firmati** dall'associazione in uscita, le **proposte di nuovi
utenti** con validazione dell'amministratore, il **calendario delle uscite** e un **report**.

Il prototipo HTML (mappa schematica, dati in localStorage) è stato trasformato in una vera
applicazione multi-utente:

- **Next.js** (App Router) deployata su **Vercel**
- **Supabase**: database Postgres, autenticazione email/password, Row Level Security
- **Leaflet + OpenStreetMap** per la mappa reale (coordinate lat/lng)
- Un accesso per ogni associazione + un accesso "Coordinamento" (amministratore)

## Funzionalità

| Requisito | Come funziona |
|---|---|
| Mappa con utenti geolocalizzati | Pin colorati: **arancio** = da servire, **verde** = servito stasera, **grigio** = non trovato |
| Cambio colore una volta assistito | Salvando l'esito di stasera il pin diventa verde (o grigio se non trovato) |
| Esito serale firmato | Ogni record salva data, `org_id` (chi ha scritto), trovato, fornito, richiesto, note |
| Accesso per associazione | Login email/password; il profilo è collegato a un'organizzazione |
| Proposta nuovi utente | Tocca la mappa per posizionarlo; resta **7 giorni** con icona viola tratteggiato, poi scade |
| Validazione admin | Solo il Coordinamento valida/rifiuta: la validazione crea l'utente regolare e riporta le visite nella storia |
| Calendario uscite | Regola fissa settimanale + sabati a turno + eccezioni per singola sera (anche da file) |
| Report | Solo admin: KPI, breakdown per associazione/utente, beni forniti, richieste, CSV |

## Struttura

```
app/
  layout.tsx          font, metadata, CSS globale
  page.tsx            home: sessione Supabase → <App/>
  login/page.tsx      accesso + recupero password
  globals.css         design system ripreso dal prototipo
components/
  App.tsx             stato, dati, azioni, pannello
  MapView.tsx         mappa Leaflet + marker
  UserDetail.tsx      scheda utente + esito di stasera
  PropDetail.tsx      scheda proposta + visite + validazione
  ProposeForm.tsx     proposta nuovo utente
  EntryFields.tsx     campi condivisi dell'esito (trovato/fornito/chiesto/note)
  CalendarView.tsx    calendario delle uscite
  ReportView.tsx      report + CSV
  LoginForm.tsx       form di accesso
lib/
  supabase.ts         client browser
  supabase-server.ts  client server (sessione via cookie)
  types.ts            tipi delle tabelle
  format.ts           date, etichette, parsing CSV calendario
  duty.ts             regola fissa + eccezioni del calendario
  report.ts           calcolo report/CSV
supabase/
  migrations/0001_init.sql   tabelle + RLS + trigger profili
  seed.sql                   5 associazioni, calendario, 3 utenti demo
```


PWD: B6-rMu3brk3guLh


## Setup

### 1. Progetto Supabase

1. Crea un progetto su [supabase.com](https://supabase.com) (piano gratuito sufficiente).
2. Su **SQL Editor**, esegui `supabase/migrations/0001_init.sql`, poi `supabase/seed.sql`.
3. Su **Project Settings → API** copia `Project URL` e `anon public` key.

### 2. Variabili d'ambiente

```bash
cp .env.example .env.local
```

Compila `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Opzionale: centro e zoom
iniziali della mappa (`NEXT_PUBLIC_MAP_CENTER_*`). Su Vercel le stesse chiavi vanno in
**Settings → Environment Variables**.

### 3. Utenti

Gli utenti vengono creati da **Authentication → Users → Add user** in Supabase, impostando lo
**User Metadata**:

```json
{ "role": "org", "org_id": "o1", "display_name": "Croce Rossa" }
```

- un'associazione: `role = "org"` e `org_id` = id organizzazione (`o0`…`o4` dal seed);
- il coordinamento: `role = "admin"` (senza `org_id`).

Un trigger crea automaticamente la riga in `profiles`. La prima email va creata dal dashboard e
confermata manualmente (oppure disabilita "Confirm email" in Authentication → Providers).

### 4. Esecuzione locale

```bash
npm install
npm run dev
```

Apri <http://localhost:3000>.

## Deploy su Vercel

1. Push del repository su GitHub/GitLab.
2. Su [vercel.com](https://vercel.com) → **Add New Project** → importa il repository.
3. Aggiungi le variabili d'ambiente (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, eventuale centro mappa) → **Deploy**.

## Sicurezza (Row Level Security)

Tutte le tabelle hanno RLS attiva:

- **lettura**: qualsiasi utente autenticato (serve per la mappa e le liste);
- **daily_logs / proposal_verifications**: scrittura solo con `org_id` proprio (o admin) → gli
  esiti sono sempre firmati dall'associazione corretta;
- **proposals**: inserimento solo propria o admin; modifica dello stato **solo admin**;
- **service_users**: insert/update/delete **solo admin** (è la validazione a creare gli utenti);
- **calendar_overrides / settings / organizations**: **solo admin**.

## Note e limiti

- La mappa usa i tile gratuiti di OpenStreetMap: per uso intensivo valuta un provider di tile.
- Non c'è refresh in tempo reale: ricarica la pagina per vedere le azioni delle altre associazioni.
- Le coordinate degli utenti sono dati sensibili: usa sempre HTTPS (Vercel lo fa di default).
- In produzione crea almeno un utente admin e rimuovi i 3 utenti demo del seed quando non servono.
