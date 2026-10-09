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
  verifications?: ProposalVerification[];
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
