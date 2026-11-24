// Invio automatico del report a fine turno (Vercel Cron).
// Protetto da CRON_SECRET: solo chi conosce il segreto può attivarlo.
// - Giorno di servizio: dalle 20:00 alle 20:00 (ora di Roma), come nell'app.
// - Parte solo tra "autoReportHour" (impostata dal coordinamento) e le 20:00.
// - Se l'associazione ha già inviato il report (tabella report_sends) non rimanda.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { DailyLog, Org, Proposal, ServiceUser, Stop, StopLog } from "@/lib/types";
import { allRecs } from "@/lib/report";
import { buildExcelBlob, blobToBase64, reportFileName } from "@/lib/excel";

export const runtime = "nodejs";
export const maxDuration = 30;

const TZ = "Europe/Rome";
const SHIFT_SWITCH_HOUR = 20;

// Data (YYYY-MM-DD) del giorno di servizio aperto adesso, in ora di Roma.
function serviceDayKeyRome(d: Date = new Date()): string {
  return new Date(d.getTime() - SHIFT_SWITCH_HOUR * 3600 * 1000).toLocaleDateString("sv-SE", {
    timeZone: TZ,
  });
}

// Ora corrente (0-23) a Roma.
function hourRome(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)
  ) % 24;
}

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

  // 3) Client admin
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Client admin non disponibile." }, { status: 500 });
  }

  // 4) Data del report: ?date=YYYY-MM-DD (invio manuale/di recupero) oppure
  //    giorno di servizio corrente. Senza ?date= vale anche il controllo dell'orario.
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const outingDate = dateParam || serviceDayKeyRome();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(outingDate)) {
    return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  }

  if (!dateParam) {
    const { data: st } = await admin.from("settings").select("*").eq("id", "main").maybeSingle();
    const autoHour = Number((st as { autoReportHour?: number } | null)?.autoReportHour ?? 16);
    const h = hourRome();
    if (h < autoHour || h >= SHIFT_SWITCH_HOUR) {
      return NextResponse.json({
        ok: true,
        sent: false,
        message: `Fuori dalla finestra di invio (${autoHour}:00-${SHIFT_SWITCH_HOUR}:00, ora di Roma).`,
        date: outingDate,
      });
    }
  }

  // 5) Già inviato (dall'associazione o da un giro precedente)?
  const { data: already } = await admin
    .from("report_sends")
    .select("outing_date")
    .eq("outing_date", outingDate)
    .maybeSingle();
  if (already) {
    return NextResponse.json({
      ok: true,
      sent: false,
      skipped: true,
      message: "Report già inviato per questa serata.",
      date: outingDate,
    });
  }

  // 6) Leggi dati da Supabase (service role)
  const [usersRes, logsRes, proposalsRes, stopsRes, stopLogsRes, orgsRes] = await Promise.all([
    admin.from("service_users").select("*"),
    admin.from("daily_logs").select("*").eq("date", outingDate),
    admin.from("proposals").select("*"),
    admin.from("stops").select("*"),
    admin.from("stop_logs").select("*").eq("date", outingDate),
    admin.from("organizations").select("*"),
  ]);

  if (
    usersRes.error ||
    logsRes.error ||
    proposalsRes.error ||
    stopsRes.error ||
    stopLogsRes.error ||
    orgsRes.error
  ) {
    return NextResponse.json({ error: "Errore nella lettura dei dati." }, { status: 500 });
  }

  const users = (usersRes.data || []) as ServiceUser[];
  const logs = (logsRes.data || []) as DailyLog[];
  const proposals = (proposalsRes.data || []) as Proposal[];
  const stops = (stopsRes.data || []) as Stop[];
  const stopLogs = (stopLogsRes.data || []) as StopLog[];
  const orgs = (orgsRes.data || []) as Org[];

  // 7) Costruisci righe del report
  const recs = allRecs(users, logs, proposals).filter((r) => r.date === outingDate);
  const stopLogsDay = stopLogs.filter((g) => g.date === outingDate);

  if (recs.length === 0 && stopLogsDay.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nessun dato per questa data.",
      sent: false,
      date: outingDate,
    });
  }

  // 8) "Prenota" l'invio: se un'altra esecuzione (o l'associazione) l'ha appena
  //    fatto, l'insert fallisce per chiave duplicata e non si manda due volte.
  const { error: claimErr } = await admin
    .from("report_sends")
    .insert({ outing_date: outingDate, sent_by: null, org_id: null, sent_at: new Date().toISOString() });
  if (claimErr) {
    if (claimErr.code === "23505") {
      return NextResponse.json({
        ok: true,
        sent: false,
        skipped: true,
        message: "Report già inviato per questa serata.",
        date: outingDate,
      });
    }
    console.error("report_sends", claimErr);
    return NextResponse.json({ error: "Impossibile registrare l'invio." }, { status: 500 });
  }

  // 9) Genera Excel e invia a Google Apps Script; se qualcosa fallisce,
  //    si toglie la prenotazione così il prossimo giro può riprovare.
  const release = async () => {
    await admin.from("report_sends").delete().eq("outing_date", outingDate);
  };

  try {
    const blob = await buildExcelBlob(recs, orgs, `Report ${outingDate}`, stops, stopLogsDay, {
      extras: true,
    });
    const xlsxBase64 = await blobToBase64(blob);
    const filename = reportFileName("report_accoglienza", outingDate);

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
      await release();
      return NextResponse.json({ error: "Invio al servizio email non riuscito." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      message: "Report inviato automaticamente.",
      date: outingDate,
      rows: recs.length,
      filename,
    });
  } catch (e) {
    console.error("auto-send-report", e);
    await release();
    return NextResponse.json({ error: "Invio non riuscito." }, { status: 500 });
  }
}