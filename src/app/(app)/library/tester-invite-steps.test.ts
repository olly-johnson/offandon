import { describe, expect, it } from "vitest";

import {
  INSTAGRAM_MANAGE_ACCESS_URL,
  TESTER_INVITE_STEPS,
} from "./tester-invite-steps";

describe("INSTAGRAM_MANAGE_ACCESS_URL", () => {
  it("points at the Instagram manage-access page the client must visit", () => {
    expect(INSTAGRAM_MANAGE_ACCESS_URL).toBe(
      "https://www.instagram.com/accounts/manage_access/",
    );
  });
});

describe("TESTER_INVITE_STEPS", () => {
  it("has at least three actionable steps", () => {
    expect(TESTER_INVITE_STEPS.length).toBeGreaterThanOrEqual(3);
  });

  it("is numbered sequentially starting at 1", () => {
    TESTER_INVITE_STEPS.forEach((step, i) => {
      expect(step.n).toBe(i + 1);
    });
  });

  it("every step has non-empty instruction text", () => {
    for (const step of TESTER_INVITE_STEPS) {
      expect(step.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("tells the client to open the manage-access page and find the Tester Invites tab", () => {
    const joined = TESTER_INVITE_STEPS.map((s) => s.text.toLowerCase()).join(" ");
    expect(joined).toContain("manage_access");
    expect(joined).toContain("tester invites");
    expect(joined).toContain("accept");
  });

  it("never uses em-dashes (Bot OS copy rule)", () => {
    for (const step of TESTER_INVITE_STEPS) {
      expect(step.text).not.toContain("—");
    }
  });
});
