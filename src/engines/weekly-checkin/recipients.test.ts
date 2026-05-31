import { describe, expect, it } from "vitest";

import { filterToTestRecipient } from "./recipients";
import type { Recipient } from "./types";

const cohort: Recipient[] = [
  { userId: "1", email: "a@example.com", displayName: "A" },
  { userId: "2", email: "Egg29072@Gmail.com", displayName: "Charles" },
  { userId: "3", email: "c@example.com", displayName: "C" },
];

describe("filterToTestRecipient", () => {
  it("returns the full cohort when no override is set", () => {
    expect(filterToTestRecipient(cohort, undefined)).toHaveLength(3);
    expect(filterToTestRecipient(cohort, "")).toHaveLength(3);
    expect(filterToTestRecipient(cohort, null)).toHaveLength(3);
  });

  it("restricts to the single matching email, case-insensitively", () => {
    const out = filterToTestRecipient(cohort, "egg29072@gmail.com");
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe("2");
  });

  it("trims whitespace around the override", () => {
    expect(filterToTestRecipient(cohort, "  a@example.com  ")).toHaveLength(1);
  });

  it("returns empty when the override matches nobody (never injects)", () => {
    expect(filterToTestRecipient(cohort, "nobody@nowhere.com")).toHaveLength(0);
  });
});
