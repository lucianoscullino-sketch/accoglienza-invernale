// Esportazione dei report in file Excel (.xlsx) veri e propri,
// generati interamente nel browser (libreria "xlsx"). Il file viene
// scaricato dal browser: su telefono finisce in Download/File.

import type { Org, Stop, StopLog } from "@/lib/types";
import { REPORT_HEAD, reportTable, type Rec } from "@/lib/report";

export type ExcelRow = Rec;

export function reportFileName(prefix: string, key: string): string {
  const d = key.replaceAll("-", "");
  return `${prefix}_${d}.xlsx`;
}

function cell(v: string | number | boolean): string | number {
  if (typeof v === "boolean") return v ? "sì" : "no";
  return v;
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
  const XLSX = await import("xlsx");
  const data = reportTable(rows, orgs, stops, stopLogs, opts).map((r) => r.map((v) => cell(v)));
  const ws = XLSX.utils.aoa_to_sheet([REPORT_HEAD, ...data]);
  ws["!cols"] = [
    { wch: 12 }, // Data
    { wch: 20 }, // Associazione
    { wch: 24 }, // Tappa
    { wch: 12 }, // Esito tappa
    { wch: 13 }, // Sacchi a pelo
    { wch: 9 }, // Coperte
    { wch: 20 }, // Nickname
    { wch: 9 }, // Trovato
    { wch: 36 }, // Fornito
    { wch: 30 }, // Richiesto
    { wch: 36 }, // Note importanti
    { wch: 30 }, // Note uscita
    { wch: 9 }, // Proposta
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Report");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
