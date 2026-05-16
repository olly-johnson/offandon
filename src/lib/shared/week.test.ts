import { describe, expect, it } from "vitest";

import { isoWeekStart } from "./week";

describe("isoWeekStart", () => {
  it("returns the Monday of the same ISO week as a Friday", () => {
    // 2026-05-15 is a Friday.
    expect(isoWeekStart(new Date("2026-05-15T01:00:00Z"))).toBe("2026-05-11");
  });

  it("returns the Monday of the same ISO week as a Saturday", () => {
    // 2026-05-16 is a Saturday.
    expect(isoWeekStart(new Date("2026-05-16T01:00:00Z"))).toBe("2026-05-11");
  });

  it("returns the Monday of the same ISO week as Monday itself", () => {
    expect(isoWeekStart(new Date("2026-05-11T00:00:00Z"))).toBe("2026-05-11");
  });

  it("treats Sunday as the END of the prior ISO week", () => {
    // 2026-05-17 is a Sunday.
    expect(isoWeekStart(new Date("2026-05-17T23:59:59Z"))).toBe("2026-05-11");
  });

  it("handles year boundary correctly", () => {
    // 2026-01-01 is a Thursday; ISO Monday of that week is 2025-12-29.
    expect(isoWeekStart(new Date("2026-01-01T12:00:00Z"))).toBe("2025-12-29");
  });
});
