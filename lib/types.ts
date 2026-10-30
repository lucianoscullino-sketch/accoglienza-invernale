// Tipi che rispecchiano le tabelle Supabase.

export type Role = "admin" | "org";

export interface Org {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  role: Role;
  org_id: string | null;
  display_name: string;
  email?: string;
  created_at?: string;
}

export interface ServiceUser {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  active: boolean;
  note?: string; // nota stabile del coordinamento, distinta dalle note serali
  suspension_note?: string; // motivo dell'ultima sospensione (coordinamento)
  deleted?: boolean; // eliminato (soft-delete): nascosto, visibile solo con flag
  created_by_org?: string | null; // associazione che ha proposto/creato l'utenza (null = non tracciato)
  stop_id: string | null; // tappa di appartenenza (null = nessuna tappa)
}

export interface DailyLog {
  id?: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  org_id: string; // id organizzazione oppure "admin"
  found: boolean;
  provided: string[];
  requested: string;
  note: string;
  created_at?: string;
}

export interface ProposalVerification {
  id?: string;
  proposal_id: string;
  date: string;
  org_id: string;
  found: boolean;
  provided: string[];
  requested: string;
  note: string;
  created_at?: string;
}

export type ProposalStatus = "pending" | "validated" | "rejected";

export interface Proposal {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  proposed_by: string;
  status: ProposalStatus;
  validated_into: string | null;
  created_at: string; // ISO
  suspended?: boolean; // sospesa dal coordinamento: fuori da mappa ed elenchi
  suspension_note?: string; // motivo della sospensione
  verifications?: ProposalVerification[];
  stop_id: string | null; // tappa di assegnazione (null = fuori tappa)
}

// Avviso del coordinamento a tutte le associazioni: resta visibile in testata
// al pannello di ogni account (associazioni comprese) finché non viene rimosso.
export interface Notice {
  id: string;
  message: string;
  created_by?: string | null;
  created_at: string; // ISO
}

// Riga assente = vale la regola fissa; org_id null = nessuna uscita.
export interface CalendarOverride {
  date: string;
  org_id: string | null;
}

export interface SatConfig {
  order: string[];
  start: string; // sabato di riferimento del turno 1
}

export interface Settings {
  id: string;
  weekly: Record<string, string>;
  sat: SatConfig;
}

export type Status = "todo" | "done" | "missing";

export type StopStatus = "active" | "suspended" | "deleted";

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: StopStatus;
  note?: string;
  created_at?: string;
  created_by?: string | null;
}
