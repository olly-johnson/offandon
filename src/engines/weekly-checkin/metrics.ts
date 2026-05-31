/**
 * Extract structured weekly-growth numbers from the free-text check-in
 * answers (BO-076).
 *
 * Clients type messy values ("7 new DMs", "£1,200", "approx 240", "3
 * reels, 1 YT"), so the parsing is deliberately forgiving: pull the
 * number(s) out, ignore currency/commas/units, and fall back to null when
 * there's nothing usable rather than failing the whole check-in. The
 * caller persists these onto weekly_checkins for the dashboard's weekly
 * progress card.
 */

export interface CheckinMetrics {
  newFollowers: number | null;
  dmsReceived: number | null;
  callsBooked: number | null;
  salesClosed: number | null;
  leadsGenerated: number | null;
  /** Captured but intentionally not charted on the dashboard. */
  revenue: number | null;
  postsPublished: number | null;
  /** 1-10 service rating; out-of-range clamps to null. */
  satisfaction: number | null;
}

const NUMBER_TOKEN = /(-?\d[\d,]*(?:\.\d+)?)\s*([km])?/i;

/**
 * Parse the FIRST number out of a string, tolerating currency symbols,
 * thousands separators, decimals, and k/m suffixes. Returns null when no
 * number is present.
 */
export function parseStatNumber(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(NUMBER_TOKEN);
  if (!match) return null;
  return applyUnit(match[1], match[2]);
}

/**
 * Sum EVERY number in the string. Used for post counts that span
 * platforms ("3 reels, 1 YT" -> 4). Returns null when there are none.
 */
export function sumStatNumbers(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const re = new RegExp(NUMBER_TOKEN.source, "gi");
  let total = 0;
  let found = false;
  for (const m of raw.matchAll(re)) {
    const n = applyUnit(m[1], m[2]);
    if (n !== null) {
      total += n;
      found = true;
    }
  }
  return found ? total : null;
}

function applyUnit(digits: string, unit: string | undefined): number | null {
  const n = Number.parseFloat(digits.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  if (!unit) return n;
  const u = unit.toLowerCase();
  if (u === "k") return n * 1_000;
  if (u === "m") return n * 1_000_000;
  return n;
}

/** Lowercased-label predicates, kept narrow to avoid cross-matches. */
function matches(label: string, needle: string): boolean {
  return label.toLowerCase().includes(needle);
}

/**
 * Map the answer set onto typed metrics. Matching is by distinctive
 * substrings of the question label, ordered so the first answer that
 * matches a metric wins. Note "leads" (plural) is used so the revenue
 * label "Revenue leading from your personal brand" can't be misread as
 * leads generated.
 */
export function extractCheckinMetrics(
  answers: Record<string, string>,
): CheckinMetrics {
  const m: CheckinMetrics = {
    newFollowers: null,
    dmsReceived: null,
    callsBooked: null,
    salesClosed: null,
    leadsGenerated: null,
    revenue: null,
    postsPublished: null,
    satisfaction: null,
  };

  for (const [label, value] of Object.entries(answers)) {
    if (m.newFollowers === null && matches(label, "follower")) {
      m.newFollowers = parseStatNumber(value);
    } else if (m.dmsReceived === null && matches(label, "dm")) {
      m.dmsReceived = parseStatNumber(value);
    } else if (m.callsBooked === null && matches(label, "call")) {
      m.callsBooked = parseStatNumber(value);
    } else if (m.salesClosed === null && matches(label, "sales")) {
      m.salesClosed = parseStatNumber(value);
    } else if (m.leadsGenerated === null && matches(label, "leads")) {
      m.leadsGenerated = parseStatNumber(value);
    } else if (m.revenue === null && matches(label, "revenue")) {
      m.revenue = parseStatNumber(value);
    } else if (m.postsPublished === null && matches(label, "post")) {
      m.postsPublished = sumStatNumbers(value);
    } else if (m.satisfaction === null && matches(label, "satisf")) {
      const s = parseStatNumber(value);
      m.satisfaction = s !== null && s >= 1 && s <= 10 ? s : null;
    }
  }

  return m;
}
