import { describe, expect, it } from "vitest";

import {
  buildIdentityDocument,
  buildIdentitySourceFiles,
  extractDisplayName,
} from "./format";

describe("buildIdentityDocument", () => {
  const answers = {
    email: "client@example.com",
    submitted_at: "2026-06-03T09:00:00Z",
    "5. What's your name and where are you based?": "Cohen Denniss, London",
    "6. What's your business?": "Landing-page positioning sprints for SaaS founders",
    "33. What are their 2am thoughts?": '"Why is my traffic not converting?"',
    "blank one": "   ",
  };

  it("renders each question as a titled Q&A block", () => {
    const doc = buildIdentityDocument(answers, "Cohen Denniss");
    expect(doc).toContain("# Off&On Identity Foundation");
    expect(doc).toContain("Member: Cohen Denniss");
    expect(doc).toContain("## 6. What's your business?");
    expect(doc).toContain("Landing-page positioning sprints for SaaS founders");
    expect(doc).toContain("## 33. What are their 2am thoughts?");
  });

  it("skips control fields (email/submitted_at) and blank answers", () => {
    const doc = buildIdentityDocument(answers);
    expect(doc).not.toContain("client@example.com");
    expect(doc).not.toContain("submitted_at");
    expect(doc).not.toContain("blank one");
  });
});

describe("extractDisplayName", () => {
  it("pulls the leading clause from the name+based question", () => {
    expect(
      extractDisplayName({ "5. What's your name and where are you based?": "Cohen Denniss, London" }),
    ).toBe("Cohen Denniss");
  });

  it("handles a Full Name field", () => {
    expect(extractDisplayName({ "Full Name": "Alex Shaw" })).toBe("Alex Shaw");
  });

  it("returns null when no name question is present", () => {
    expect(extractDisplayName({ "6. What's your business?": "x" })).toBeNull();
  });
});

describe("buildIdentitySourceFiles", () => {
  it("wraps the document as a single ClientSourceFile", () => {
    const files = buildIdentitySourceFiles({ "6. Business": "coaching" }, "Alex");
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe("identity-foundation.md");
    expect(files[0].body).toContain("## 6. Business");
  });
});
