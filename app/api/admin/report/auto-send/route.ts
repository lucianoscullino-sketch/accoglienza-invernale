// Invio automatico del report a fine turno (ad orario stabilito dal Coordinamento tramite Vercel Cron).
// Protetto da CRON_SECRET: solo chi conosce il segreto può attivarlo.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { DailyLog, Org, Proposal, ServiceUser, Stop, StopLog } from "@/lib/types";
import { allRecs } from "@/lib/report";
import { buildExcelBlob, blobToBase64, reportFileName } from "@/lib/excel";
import { today } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  // 1) Verifica segreto cron
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  // 2) Variabili necessarie
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const scriptUrl = process.env.APPS_SCRIPT_URL;
  const scriptToken = process.env.APPS_SCRIPT_TOKEN;

  if (!url || !serviceKey || !scriptUrl || !scriptToken) {
    return NextResponse.json({ error: "Variabili d'ambiente non configurate." }, { status: 500 });
  }

  // 3) Data del report (query param ?date=YYYY-MM-DD, default oggi)
  const { searchParams } = new URL(req.url);
  const outingDate = searchParams.get("date") || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outingDate)) {
    return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  }

  // 4) Leggi dati da Supabase (service role)
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Client admin non disponibile." }, { status: 500 });
  }

  const [usersRes, logsRes, proposalsRes, stopsRes, stopLogsRes, orgsRes] = await Promise.all([
    admin.from("service_users").select("*"),
    admin.from("daily_logs").select("*").eq("date", outingDate),
    admin.from("proposals").select("*"),
    admin.from("stops").select("*"),
    admin.from("stop_logs").select("*").eq("date", outingDate),
    admin.from("organizations").select("*"),
  ]);

  if (usersRes.error || logsRes.error || proposalsRes.error || stopsRes.error || stopLogsRes.error || orgsRes.error) {
    return NextResponse.json({ error: "Errore nella lettura dei dati." }, { status: 500 });
  }

  const users = (usersRes.data || []) as ServiceUser[];
  const logs = (logsRes.data || []) as DailyLog[];
  const proposals = (proposalsRes.data || []) as Proposal[];
  const stops = (stopsRes.data || []) as Stop[];
  const stopLogs = (stopLogsRes.data || []) as StopLog[];
  const orgs = (orgsRes.data || []) as Org[];

  // 5) Costruisci righe del report
  const recs = allRecs(users, logs, proposals).filter((r) => r.date === outingDate);
  const stopLogsDay = stopLogs.filter((g) => g.date === outingDate);

  if (recs.length === 0 && stopLogsDay.length === 0) {
    return NextResponse.json({ ok: true, message: "Nessun dato per questa data.", sent: false });
  }

  // 6) Genera Excel
  const blob = await buildExcelBlob(
    recs,
    orgs,
    `Report ${outingDate}`,
    stops,
    stopLogsDay,
    { extras: true }
  );

  const xlsxBase64 = await blobToBase64(blob);
  const filename = reportFileName("report_accoglienza", outingDate);

  // 7) Invia a Google Apps Script
  const r = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      token: scriptToken,
      filename,
      xlsxBase64,
      subject: `Report uscita accoglienza invernale ${outingDate}`,
      body: `In allegato il report dell'uscita del ${outingDate}, inviato automaticamente.\n\nIl file contiene dati riservati: non inoltrarlo e cancellalo dopo l'uso.`,
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
    console.error("auto-send-report", r.status, out.error || text.slice(0, 200));
    return NextResponse.json({ error: "Invio al servizio email non riuscito." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: "Report inviato automaticamente.",
    date: outingDate,
    rows: recs.length,
    filename,
  });
}