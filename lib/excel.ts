// Esportazione dei report in file Excel (.xlsx) veri e propri,
// generati interamente nel browser (libreria "xlsx"). Il file viene
// scaricato dal browser: su telefono finisce in Download/File.

import type { Org, Stop, StopLog } from "@/lib/types";
import { REPORT_HEAD, reportTable, type Rec } from "@/lib/report";

export function reportFileName(prefix: string, key: string): string {
  const d = key.replaceAll("-", "");
  return `${prefix}_${d}.xlsx`;
}

function cell(v: string | number | boolean): string | number {
  if (typeof v === "boolean") return v ? "sì" : "no";
  return v;
}

/** Costruisce il file Excel (.xlsx) e lo restituisce come Blob. */
export async function buildExcelBlob(
  rows: Rec[],
  orgs: Org[],
  sheetName: string,
  stops: Stop[] = [],
  stopLogs: StopLog[] = [],
  opts: { extras?: boolean } = {}
): Promise<Blob> {
  const XLSX = await import("xlsx");
  const data = reportTable(rows, orgs, stops, stopLogs, opts).map((r) => r.map((v) => cell(v)));
  const ws = XLSX.utils.aoa_to_sheet([REPORT_HEAD, ...data]);
  // Larghezza automatica: la cella più lunga di ogni colonna (min 8, max 60 caratteri).
  const all = [REPORT_HEAD as (string | number)[], ...data];
  ws["!cols"] = REPORT_HEAD.map((_, c) => ({
    wch: Math.min(60, Math.max(8, ...all.map((r) => String(r[c] ?? "").length + 2))),
  }));
  // Celle unite per evitare ripetizioni: Data, Associazione, Tappa e beni (colonne C-F).
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const runs = (c0: number, c1: number, key: (r: (string | number)[]) => string) => {
    let start = 0;
    for (let i = 1; i <= data.length; i++) {
      if (i === data.length || key(data[i]) !== key(data[start])) {
        if (i - start > 1) merges.push({ s: { r: start + 1, c: c0 }, e: { r: i, c: c1 } });
        start = i;
      }
    }
  };
  runs(0, 0, (r) => String(r[0]));
  runs(1, 1, (r) => `${r[0]}|${r[1]}`);
  for (let c = 2; c <= 5; c++) runs(c, c, (r) => `${r[0]}|${r[1]}|${r[2]}`);
  ws["!merges"] = merges;  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Report");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Contenuto di un Blob in base64 (per inviarlo a un'API in JSON). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Costruisce il workbook e lo scarica nel browser. */
export async function downloadExcel(
  rows: Rec[],
  orgs: Org[],
  sheetName: string,
  fileName: string,
  stops: Stop[] = [],
  stopLogs: StopLog[] = [],
  opts: { extras?: boolean } = {}
): Promise<void> {
  const blob = await buildExcelBlob(rows, orgs, sheetName, stops, stopLogs, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
