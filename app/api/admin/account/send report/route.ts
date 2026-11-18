// Invio del report di fine uscita tramite uno script Google Apps Script
// (nessuna password della casella sul server: solo URL e codice segreto).
// Il destinatario NON arriva dal client: lo decide lo script (proprietà REPORT_TO).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_B64 = 4_000_000; // ~3 MB di file: il report è molto più piccolo

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const scriptToken = process.env.APPS_SCRIPT_TOKEN;
  if (!url || !anon || !scriptUrl || !scriptToken) {
    return NextResponse.json({ error: "Invio report non configurato sul server." }, { status: 500 });
  }

  // Chi chiama deve essere un utente dell'app (admin o associazione).
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  const { data: prof } = await sb
    .from("profiles")
    .select("id, role, org_id, display_name")
    .eq("id", u.user.id)
    .maybeSingle();
  if (!prof) return NextResponse.json({ error: "Utente non autorizzato." }, { status: 403 });

  let body: { outingDate?: unknown; xlsxBase64?: unknown; filename?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const outingDate = typeof body.outingDate === "string" ? body.outingDate : "";
  const xlsxBase64 = typeof body.xlsxBase64 === "string" ? body.xlsxBase64 : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outingDate) || !/^[\w\- .]{1,80}\.xlsx$/.test(filename) || !xlsxBase64 || xlsxBase64.length > MAX_B64) {
    return NextResponse.json({ error: "Dati del report non validi." }, { status: 400 });
  }

  // Nome dell'associazione che invia (per l'oggetto e il testo della mail).
  let orgLabel = prof.display_name || "coordinamento";
  if (prof.org_id) {
    const { data: o } = await sb.from("organizations").select("name").eq("id", prof.org_id).maybeSingle();
    if (o?.name) orgLabel = o.name;
  }

  const r = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      token: scriptToken,
      filename,
      xlsxBase64,
      subject: `Report uscita accoglienza invernale ${outingDate}`,
      body:
        `In allegato il report dell'uscita del ${outingDate}, inviato da ${orgLabel}.\n\n` +
        `Il file contiene dati riservati: non inoltrarlo e cancellalo dopo l'uso.`,
    }),
  });
  const text = await r.text();
  let out: { ok?: boolean; error?: string } = {};
  try {
    out = JSON.parse(text);
  } catch {
    /* risposta non JSON */
  }
  if (!r.ok || !out.ok) {
    console.error("send-report", r.status, out.error || text.slice(0, 200));
    return NextResponse.json({ error: "Invio non riuscito." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
