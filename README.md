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
| Proposta nuovi utente | Tocca la mappa per posizionarlo; resta **7 giorni** con icona viola tratteggiato, poi scade. Chi l'ha proposta può cancellarla (solo se ancora in attesa) e correggerne nome/descrizione; le visite già registrate sono correggibili dal Coordinamento (tutte) e dall'associazione (le proprie) |
| Validazione admin | Solo il Coordinamento valida/rifiuta: la validazione crea l'utente regolare e riporta le visite nella storia |
| Avviso a tutte le associazioni | Solo il Coordinamento, dal tab «Comunicazioni»: il testo permane in testata al pannello di **ogni** account (associazioni comprese) finché non viene rimosso |
| Riepilogo all'accesso | Il giorno della propria uscita l'associazione vede **a popup** il sommario della sera prima con statistiche e note evidenziate; i nuovi avvisi compaiono a popup alla prima lettura |
| Calendario uscite | Regola fissa settimanale + sabati a turno + eccezioni per singola sera (anche da file) |
| Report | Solo admin (su periodo, con KPI): esportazione **CSV** (copia-incolla) o **file Excel (.xlsx)** da scaricare |
| Il tuo report | Ogni associazione: attività di un suo turno (default l'ultima uscita, stasera inclusa) con **download Excel** |

## Guida rapida all'interfaccia

Le istruzioni che un tempo comparivano come testi di aiuto dentro le schede sono raccolte qui.

### Mappa
- **Pin**: arancio = da servire, verde = servito stasera, grigio = non trovato, viola
  tratteggiato = proposta; per le utenze non attive, tratteggiato = **sospeso** e **X** =
  eliminato.
- **Flag «Proposte» / «Sospesi» / «Eliminati»** (in alto a sinistra sulla mappa): «Proposte»
  mostra i pin viola delle proposte attive (**acceso di default**); «Sospesi» / «Eliminati» (spenti di
  default) mostrano le utenze sospese o eliminate e le proposte eliminate. Sono visibili a tutte le
  associazioni, ma solo il coordinamento può sospendere/eliminare/ripristinare.
- Cliccando un pin si apre la scheda di quell'utente o proposta (anche per quelle eliminate,
  che si mostrano in **sola lettura**).

### Esito di stasera
- Chi è in uscita registra l'esito: **trovato**, cosa è stato
  **fornito**, cosa **chiede** e note. Salvando, il pin diventa **verde** (trovato) o
  **grigio** (non trovato).
- Per le proposte si registra dalla scheda proposta; per gli utenti regolari dalla scheda
  utente.

### Scheda utente — "Report giorni precedenti"
- Mostra la **sintesi degli ultimi 3 giorni**. Cliccando «Vedi dettaglio» si apre il report
  completo e lo si può scorrere **avanti e indietro per data** («Precedente» / «Successivo»).

### Scheda utente — Modifica dati
- Il tasto «Modifica» è sempre presente in fondo. Il **coordinamento** modifica tutte le
  utenze; le **associazioni** solo quelle da loro create (nome, descrizione, posizione, nota).

### Sospendi / Elimina utente (solo coordinamento)
- **Sospendere** nasconde l'utenza da mappa ed elenchi ed è reversibile («Riattiva»).
- **Eliminare** la nasconde e la sposta fra gli «Eliminati» (flag mappa): è sempre
  ripristinabile con «Ripristina». Un utente può passare a "eliminato" da qualsiasi stato.

### Proposte di nuovi utenti
- Una proposta resta sulla mappa **7 giorni** e va servita ogni sera; se non viene validata,
  scade e sparisce dalla mappa.
- Il **coordinamento** valida o rifiuta dalla scheda; la validazione crea l'utente regolare e
  riporta le visite nella sua storia.
- Chi ha proposto può **cancellare** la proposta (solo se ancora in attesa) e correggerne
  nome/descrizione.
- Il coordinamento può **eliminare** una proposta da **qualsiasi stato**: resta tracciata nel
  sistema e si rivede col flag «Eliminati», in **sola lettura**.

### Comunicazioni (tab, ex «Proposte»)
- Il tab «Comunicazioni» raccoglie le proposte di nuovi utenti e gli **avvisi** del coordinamento.
  Nel tab la sezione avvisi sta **in alto** (tasto e form, solo per il coordinamento), l'elenco
  delle proposte al centro e «Proponi un nuovo utente» **in fondo**.
- Solo il **coordinamento** può pubblicare un avviso con «Invia avviso a tutte le associazioni»:
  il testo compare nel banner in testata al pannello di **tutti** gli account e permane visibile —
  in qualunque tab — finché il coordinamento non preme «Rimuovi» (l'elenco degli avvisi pubblicati
  sta quindi solo nel banner, non nel tab). Se la tabella manca, compare il promemoria di eseguire
  `0013_notices.sql`.
- **Prima lettura**: quando un'associazione accede e ci sono avvisi che non ha ancora visto,
  questi compaiono anche **a popup** (una volta per dispositivo), oltre al banner permanente.

### Riepilogo all'accesso (associazione in uscita)
- Il giorno della **propria uscita**, accedendo, l'associazione vede un popup con il
  **sommario dell'uscita della sera prima**: chi era in uscita ieri e le statistiche
  (utenze sulla mappa, esiti registrati, trovati/non trovati).
- Nell'elenco vengono citate **con nome solo le utenze il cui campo «Note per la prossima
  uscita» è compilato**, con la nota **evidenziata**: servono alla prossima uscita e
  permangono in storia fino a cancellazione. Le altre utenze restano conteggiate solo
  nelle statistiche.
- Il popup si vede **una volta al giorno** per dispositivo; gli avvisi non letti si aggregano
  allo stesso popup.

### Password
- «Password dimenticata?» invia un link per impostare una nuova password (pagina
  `/reset-password`). Su Supabase quell'URL va aggiunto tra i Redirect URL autorizzati
  (Authentication → URL Configuration).
- **Link e browser diversi**: il link di default di Supabase (PKCE, `?code=`) funziona
  **solo nello stesso browser** in cui è stato richiesto il reset — se lo apri
  dall'app di posta o da un altro dispositivo compare l'errore
  «PKCE code verifier not found». Per rendere il link validabile da ovunque,
  personalizza il template email (Authentication → Emails → *Reset Password*) con il
  **token hash**:

  ```html
  <h2>Reimposta la password</h2>
  <p>Hai richiesto di reimpostare la password del tuo account su Accoglienza Invernale.</p>
  <p><a href="{{ .SiteURL }}/reset-password?hash={{ .TokenHash }}">Imposta una nuova password</a></p>
  <p>Il link è valido una sola volta e scade tra poco. Se non l'hai richiesto tu, ignora questa email.</p>
  ```

  La pagina `/reset-password` riconosce sia il vecchio `?code=` sia il nuovo
  `?hash=` e in ogni caso mostra messaggi d'errore leggibili. Imposta inoltre la
  **Site URL** (Authentication → URL Configuration) sul dominio di produzione,
  così `{{ .SiteURL }}` punta al sito vero.

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
2. Su **SQL Editor**, esegui `supabase/migrations/0001_init.sql`, poi le migrazioni successive
   in ordine (`0002` … `0013`), infine `supabase/seed.sql`. Su un database già esistente
   esegui solo le migrazioni mancanti (sono idempotenti).
3. Su **Project Settings → API** copia `Project URL` e `anon public` key.

### 2. Variabili d'ambiente

```bash
cp .env.example .env.local
```

Compila `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Opzionale: centro e zoom
iniziali della mappa (`NEXT_PUBLIC_MAP_CENTER_*`). Su Vercel le stesse chiavi vanno in
**Settings → Environment Variables**.

### 3. Utenti

**Modo rapido (consigliato per le associazioni)**: dal tab **Associazioni** il coordinamento
crea l'associazione indicando nome **ed email dell'account** (facoltativa): l'utente Supabase
nasce già confermato e collegato all'associazione, **senza password** — all'associazione basta
usare «Password dimenticata?» nella schermata di accesso per impostarla (serve l'SMTP
configurato, vedi sopra). Se l'account non viene creato, la creazione dell'associazione viene
annullata (niente stati parziali).

**Dal dashboard** (utenti manuali o account di coordinamento): **Authentication → Users → Add user**
in Supabase, impostando lo **User Metadata**:

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

### Report in Excel

I report (tab "Report" dell'amministratore e "Il tuo report" delle associazioni) si scaricano
come veri file `.xlsx` generati nel browser (libreria `xlsx`, già in `package.json`, niente
installazioni sul server). Su telefono il file finisce in Download/File.

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
- **proposals**: inserimento solo propria o admin; modifica del testo (nome/descrizione) solo
  admin, oppure dall'associazione proponente se la proposta è ancora in attesa (policy
  `proposals owner update` in `0009`, da eseguire se il database è già stato creato);
  modifica dello stato **solo admin**;
  cancellazione di una proposta ancora in attesa da parte dell'associazione che l'ha creata
  (policy `proposals owner delete` in `0004`, da eseguire se il database è già stato creato);
- **service_users**: insert/update/delete **solo admin** (è la validazione a creare gli utenti);
  in più le associazioni possono **aggiornare solo i dati anagrafici** (nome, descrizione,
  posizione, nota) degli utenti **da loro create** — tracciati nella colonna `created_by_org`
  valorizzata alla validazione della proposta (policy `users owner update` in `0010`, da
  eseguire se il database è già stato creato). Un trigger impedisce a un'associazione di
  alterare stato (sospeso/eliminato) o proprietario, che restano competenza del coordinamento;
- **calendar_overrides / settings / organizations**: **solo admin**.

## Note e limiti

- La mappa usa i tile gratuiti di OpenStreetMap: per uso intensivo valuta un provider di tile.
- Non c'è refresh in tempo reale: ricarica la pagina per vedere le azioni delle altre associazioni.
- Le coordinate degli utenti sono dati sensibili: usa sempre HTTPS (Vercel lo fa di default).
- In produzione crea almeno un utente admin e rimuovi i 3 utenti demo del seed quando non servono.
