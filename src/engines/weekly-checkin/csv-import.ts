/**
 * Map rows from a GHL survey-submissions CSV export onto the same
 * {email, submittedAt, answers} shape the webhooks produce (BO-077), so a
 * one-off historical import can reuse extractCheckinMetrics + saveCheckin.
 *
 * The CSV headers are the readable question labels plus GHL's own columns
 * (email, a submission timestamp, contact id/name). We detect the email
 * and date columns tolerantly and treat every other column as an answer;
 * the metric extractor ignores columns it doesn't recognise.
 */

export interface CsvCheckin {
  email: string;
  /** ISO string parsed from the date column, or null when absent/unparseable. */
  submittedAt: string | null;
  answers: Record<string, string>;
}

/** Lowercased-header predicates. Date detection prefers a real timestamp. */
function findEmailHeader(headers: string[]): string | null {
  return headers.find((h) => h.toLowerCase().includes("email")) ?? null;
}

function findDateHeader(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  // Prefer an actual submission timestamp over the "week ending" answer.
  const preferred = ["submitted", "submission", "created", "date created", "timestamp"];
  for (const needle of preferred) {
    const i = lower.findIndex((h) => h.includes(needle));
    if (i !== -1) return headers[i];
  }
  const wk = lower.findIndex((h) => h.includes("week ending") || h.includes("date"));
  return wk !== -1 ? headers[wk] : null;
}

/**
 * Convert one parsed CSV row. Returns null when the row has no usable
 * email (can't be matched to a Bot OS user, so the caller skips it).
 */
export function csvRowToCheckin(
  row: Record<string, string>,
  cols: { emailHeader: string | null; dateHeader: string | null },
): CsvCheckin | null {
  const rawEmail = cols.emailHeader ? row[cols.emailHeader] : undefined;
  if (!rawEmail || !rawEmail.includes("@")) return null;
  const email = rawEmail.toLowerCase().trim();

  let submittedAt: string | null = null;
  if (cols.dateHeader) {
    const raw = row[cols.dateHeader];
    if (raw && !Number.isNaN(Date.parse(raw))) {
      submittedAt = new Date(raw).toISOString();
    }
  }

  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === cols.emailHeader || k === cols.dateHeader) continue;
    answers[k] = v;
  }

  return { email, submittedAt, answers };
}

/**
 * Map every row, detecting the email/date columns once from the first
 * row's keys. Rows without an email are dropped.
 */
export function mapCsvRowsToCheckins(
  rows: Record<string, string>[],
): CsvCheckin[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const cols = {
    emailHeader: findEmailHeader(headers),
    dateHeader: findDateHeader(headers),
  };
  return rows
    .map((r) => csvRowToCheckin(r, cols))
    .filter((c): c is CsvCheckin => c !== null);
}
