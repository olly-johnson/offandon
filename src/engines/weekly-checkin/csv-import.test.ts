import { describe, expect, it } from "vitest";

import { csvRowToCheckin, mapCsvRowsToCheckins } from "./csv-import";

describe("mapCsvRowsToCheckins", () => {
  const rows = [
    {
      "Contact Id": "abc",
      Email: "Client@Example.com",
      "Submitted On": "2026-05-25T09:00:00Z",
      "2. Date (Week ending)": "2026-05-25",
      "6B. DMs received": "7 DMs",
      "6F. Revenue": "£1,200",
    },
  ];

  it("pulls email + submittedAt and treats the rest as answers", () => {
    const [c] = mapCsvRowsToCheckins(rows);
    expect(c.email).toBe("client@example.com");
    expect(c.submittedAt).toBe("2026-05-25T09:00:00.000Z");
    // every non-email/non-date column is carried through as an answer
    expect(c.answers).toMatchObject({
      "2. Date (Week ending)": "2026-05-25",
      "6B. DMs received": "7 DMs",
      "6F. Revenue": "£1,200",
    });
    // email + the chosen date column are excluded from answers
    expect(c.answers).not.toHaveProperty("Email");
    expect(c.answers).not.toHaveProperty("Submitted On");
    // the contact id is harmless noise the extractor ignores
    expect(c.answers["Contact Id"]).toBe("abc");
  });

  it("prefers a real timestamp column over the 'week ending' answer", () => {
    const [c] = mapCsvRowsToCheckins(rows);
    // 'Submitted On' chosen as date; 'week ending' stays an answer
    expect(c.answers).toHaveProperty("2. Date (Week ending)");
  });

  it("falls back to a 'week ending' column when there's no timestamp", () => {
    const [c] = mapCsvRowsToCheckins([
      { Email: "a@b.com", "Week ending": "2026-05-25", "6B. DMs": "3" },
    ]);
    expect(c.submittedAt).toBe("2026-05-25T00:00:00.000Z");
    expect(c.answers).not.toHaveProperty("Week ending");
  });

  it("drops rows with no usable email", () => {
    expect(
      mapCsvRowsToCheckins([{ Email: "", "6B. DMs": "3" }]),
    ).toHaveLength(0);
    expect(
      mapCsvRowsToCheckins([{ Name: "nope", "6B. DMs": "3" }]),
    ).toHaveLength(0);
  });

  it("leaves submittedAt null when the date is missing or unparseable", () => {
    const c = csvRowToCheckin(
      { Email: "a@b.com", "Submitted On": "not-a-date", q: "v" },
      { emailHeader: "Email", dateHeader: "Submitted On" },
    );
    expect(c?.submittedAt).toBeNull();
  });
});
