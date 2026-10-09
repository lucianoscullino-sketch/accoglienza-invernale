// Esportazione dei report in file Excel (.xlsx) veri e propri,
// generati interamente nel browser (libreria "xlsx"). Il file viene
// scaricato dal browser: su telefono finisce in Download/File.

import type { Org } from "@/lib/types";
import { orgName } from "@/lib/format";
import type { Rec } from "@/lib/report";

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
  fileName: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const head = ["Data", "Associazione", "Nickname", "Trovato", "Fornito", "Richiesto", "Note", "Proposta"];
  const data = rows.map((r) => [
    cell(r.date),
    cell(orgName(r.org, orgs)),
    cell(r.name),
    cell(r.found),
    cell(r.provided.join(" + ")),
    cell(r.requested),
    cell(r.note),
    cell(r.prop),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 9 }, { wch: 36 }, { wch: 30 }, { wch: 36 }, { wch: 9 }];
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
