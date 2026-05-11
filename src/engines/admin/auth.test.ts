import { describe, expect, it } from "vitest";

import { isAdmin } from "./auth";

describe("isAdmin", () => {
  it("returns true when app_metadata.is_admin === true", () => {
    expect(
      isAdmin({
        id: "u",
        app_metadata: { is_admin: true },
      }),
    ).toBe(true);
  });

  it("returns false when app_metadata.is_admin === false", () => {
    expect(
      isAdmin({
        id: "u",
        app_metadata: { is_admin: false },
      }),
    ).toBe(false);
  });

  it("returns false when app_metadata.is_admin is missing", () => {
    expect(isAdmin({ id: "u", app_metadata: {} })).toBe(false);
  });

  it("returns false when app_metadata is missing", () => {
    expect(isAdmin({ id: "u" })).toBe(false);
  });

  it("returns false when user is null", () => {
    expect(isAdmin(null)).toBe(false);
  });

  it("rejects truthy non-boolean values (defends against string 'true')", () => {
    expect(
      isAdmin({
        id: "u",
        app_metadata: { is_admin: "true" as unknown as boolean },
      }),
    ).toBe(false);
    expect(
      isAdmin({
        id: "u",
        app_metadata: { is_admin: 1 as unknown as boolean },
      }),
    ).toBe(false);
  });
});
