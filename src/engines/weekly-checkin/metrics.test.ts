import { describe, expect, it } from "vitest";

import { extractCheckinMetrics, parseStatNumber, sumStatNumbers } from "./metrics";

describe("parseStatNumber", () => {
  it("reads a bare integer", () => {
    expect(parseStatNumber("7")).toBe(7);
  });

  it("pulls the first number out of messy prose", () => {
    expect(parseStatNumber("7 new DMs this week")).toBe(7);
    expect(parseStatNumber("approx 240")).toBe(240);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseStatNumber("£1,200")).toBe(1200);
    expect(parseStatNumber("$3,500.50")).toBe(3500.5);
  });

  it("expands k / m suffixes", () => {
    expect(parseStatNumber("1.2k")).toBe(1200);
    expect(parseStatNumber("3M")).toBe(3_000_000);
  });

  it("treats explicit zero as 0, not null", () => {
    expect(parseStatNumber("0")).toBe(0);
    expect(parseStatNumber("none, 0 this week")).toBe(0);
  });

  it("returns null for blank / non-numeric / nullish", () => {
    expect(parseStatNumber("")).toBeNull();
    expect(parseStatNumber("n/a")).toBeNull();
    expect(parseStatNumber("   ")).toBeNull();
  });
});

describe("sumStatNumbers", () => {
  it("adds every number it finds (post counts across platforms)", () => {
    expect(sumStatNumbers("3 reels, 1 YT")).toBe(4);
    expect(sumStatNumbers("2 IG + 2 TikTok + 1 YouTube")).toBe(5);
  });

  it("returns a single number unchanged", () => {
    expect(sumStatNumbers("5")).toBe(5);
  });

  it("returns null when there are no numbers", () => {
    expect(sumStatNumbers("a few")).toBeNull();
  });
});

describe("extractCheckinMetrics", () => {
  const answers = {
    "Full Name": "Alex Ben Shaw",
    "3. What's your niche / industry?": "fitness coaching",
    "4. What content did you post this week?": "3 reels, 1 YT",
    "6A. New followers (approx)": "240",
    "6B. DMs received": "7 DMs",
    "6C. Calls booked (and where from ie. IG reels, YT, outbound)": "2 from IG reels",
    "6D. Sales closed": "1",
    "6E. Leads generated": "5",
    "6F. Revenue leading from your personal brand (if any)": "£1,200",
    "How satisfied are you with the service this week?": "9",
  };

  it("maps each labelled metric to its column", () => {
    const m = extractCheckinMetrics(answers);
    expect(m.newFollowers).toBe(240);
    expect(m.dmsReceived).toBe(7);
    expect(m.callsBooked).toBe(2);
    expect(m.salesClosed).toBe(1);
    expect(m.leadsGenerated).toBe(5);
    expect(m.revenue).toBe(1200);
    expect(m.postsPublished).toBe(4); // summed across platforms
    expect(m.satisfaction).toBe(9);
  });

  it("does NOT mistake 'Revenue leading...' for leads generated", () => {
    const m = extractCheckinMetrics({
      "6F. Revenue leading from your personal brand (if any)": "£900",
    });
    expect(m.revenue).toBe(900);
    expect(m.leadsGenerated).toBeNull();
  });

  it("clamps an out-of-range satisfaction to null (protects the CHECK)", () => {
    expect(extractCheckinMetrics({ "How satisfied this week?": "0" }).satisfaction).toBeNull();
    expect(extractCheckinMetrics({ "How satisfied this week?": "11" }).satisfaction).toBeNull();
    expect(extractCheckinMetrics({ "How satisfied this week?": "8" }).satisfaction).toBe(8);
  });

  it("leaves unmatched metrics null", () => {
    const m = extractCheckinMetrics({ "Full Name": "X", "Email": "a@b.com" });
    expect(m.newFollowers).toBeNull();
    expect(m.revenue).toBeNull();
    expect(m.satisfaction).toBeNull();
  });
});
