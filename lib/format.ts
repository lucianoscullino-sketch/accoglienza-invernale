// Formattazione date e costanti di dominio, riprese dal prototipo.

export const DAY = 86400000;

export const ITEMS = [
  "Tè caldo",
  "Salato",
  "Dolce",
  "Coperta",
  "Sacco a pelo",
  "Vestiti caldi",
  "Calze",
  "Kit igiene",
  "Guanti e cappello",
] as const;

export const ST_LABEL: Record<string, string> = {
  todo: "Da servire",
  done: "Servito",
  missing: "Non trovato",
  prop: "In attesa",
};

export const WD_IT = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];

export const WK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const pad = (n: number) => String(n).padStart(2, "0");

export const keyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => keyOf(new Date());

export const addDaysKey = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDay = (k: string) =>
  cap(
    new Date(k + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  );

export const fmtShort = (k: string) =>
  cap(
    new Date(k + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  );

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const fmtDM = (ms: number | string) =>
  new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

export const orgName = (id: string, orgs: { id: string; name: string }[]) =>
  id === "admin" ? "Coordinamento" : (orgs.find((o) => o.id === id) || {}).name || id;

// Parsing delle righe di un file/eccezioni calendario: "2026-11-03;Croce Rossa".
// Ritorna [data, idOrg] oppure [data, null] = torna alla regola fissa.
export function parseCal(
  text: string,
  orgs: { id: string; name: string }[]
): { ok: [string, string | null][]; bad: string[] } {
  const ok: [string, string | null][] = [];
  const bad: string[] = [];
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || /^data\b/i.test(line)) return;
    const parts = line.split(/[;\t,]/).map((x) => x.trim());
    if (parts.length < 2 || !parts[1]) {
      bad.push(line);
      return;
    }
    let d = parts[0];
    let m: RegExpMatchArray | null;
    if ((m = d.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)))
      d = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    else if ((m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))
      d = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    else {
      bad.push(line);
      return;
    }
    const dt = new Date(d + "T12:00:00");
    if (isNaN(dt.getTime()) || keyOf(dt) !== d) {
      bad.push(line);
      return;
    }
    const org = orgs.find((o) => o.name.toLowerCase() === parts[1].toLowerCase());
    if (org) ok.push([d, org.id]);
    else if (/^(nessuna|nessuno|nessuna uscita|riposo|-)$/i.test(parts[1])) ok.push([d, ""]);
    else if (/^(regola|standard|come da calendario|fisso)$/i.test(parts[1])) ok.push([d, null]);
    else bad.push(line);
  });
  return { ok, bad };
}

export const VER_TXT = {
  none: "mai verificata",
  ok: "ultima verifica: trovato",
  no: "ultima verifica: non trovato",
} as const;
