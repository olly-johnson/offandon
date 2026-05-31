/**
 * Minimal RFC-4180-ish CSV parser (BO-077).
 *
 * Used by the one-off GHL survey-submissions importer. We avoid a
 * dependency for a single script; this handles the cases a GHL export
 * actually produces: quoted fields, commas and newlines inside quotes,
 * "" escaped quotes, CRLF line endings, and a leading UTF-8 BOM.
 *
 * Returns one object per data row, keyed by the (trimmed) header row.
 * Values are NOT trimmed - check-in answers are prose and trailing
 * spaces are harmless to the number extractor.
 */

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // swallow; the \n that follows ends the row
    } else {
      field += c;
    }
  }
  // Flush a final unterminated row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== "")) // skip fully blank lines
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
}
