import { describe, expect, it, vi } from "vitest";

import type { MediaAnalysis } from "@/engines/research";

import { buildVaultRow, type VaultClient } from "./vault";

const COMPETITOR = {
  id: "comp1",
  username: "alexhormozi",
};

const MEDIA = {
  id: "Cxyz",
  permalink: "https://instagram.com/p/Cxyz",
  posted_at: "2026-04-01T10:00:00.000Z",
  view_count: 4_800_000,
  like_count: 120_000,
  comments_count: 800,
};

const ANALYSIS: MediaAnalysis = {
  transcript: "Three things I learned about hiring this month",
  hook: "Three things I learned about hiring this month",
  hook_type: "CURIOSITY",
  structure: "List of three with personal anecdote each.",
  pillar_match: "Operator Frameworks",
  performance_score: 92,
  what_worked: "Number-led hook with concrete domain.",
  what_to_repeat: "Open with a number and a specific noun.",
};

describe("buildVaultRow", () => {
  it("produces a past_script asset row stamped with competitor source", () => {
    const row = buildVaultRow({
      userId: "u1",
      competitor: COMPETITOR,
      media: MEDIA,
      analysis: ANALYSIS,
    });
    expect(row.user_id).toBe("u1");
    expect(row.asset_type).toBe("past_script");
    expect(row.source_file).toBe(`competitor:${MEDIA.id}`);
    expect(row.metadata.source).toBe("competitor");
    expect(row.metadata.competitor_id).toBe(COMPETITOR.id);
    expect(row.metadata.competitor_username).toBe(COMPETITOR.username);
    expect(row.metadata.media_id).toBe(MEDIA.id);
  });

  it("uses the hook as the title when present, truncated to 80 chars", () => {
    const long = "A".repeat(200);
    const row = buildVaultRow({
      userId: "u1",
      competitor: COMPETITOR,
      media: MEDIA,
      analysis: { ...ANALYSIS, hook: long },
    });
    expect(row.title).toBe(long.slice(0, 80));
  });

  it("falls back to the username when hook is null", () => {
    const row = buildVaultRow({
      userId: "u1",
      competitor: COMPETITOR,
      media: MEDIA,
      analysis: { ...ANALYSIS, hook: null },
    });
    expect(row.title).toBe(`@${COMPETITOR.username} reference`);
  });

  it("includes view metrics in metadata for downstream display", () => {
    const row = buildVaultRow({
      userId: "u1",
      competitor: COMPETITOR,
      media: MEDIA,
      analysis: ANALYSIS,
    });
    expect(row.metadata.view_count).toBe(MEDIA.view_count);
    expect(row.metadata.like_count).toBe(MEDIA.like_count);
    expect(row.metadata.comments_count).toBe(MEDIA.comments_count);
    expect(row.metadata.permalink).toBe(MEDIA.permalink);
  });

  it("concatenates transcript + what_worked + what_to_repeat into the body", () => {
    const row = buildVaultRow({
      userId: "u1",
      competitor: COMPETITOR,
      media: MEDIA,
      analysis: ANALYSIS,
    });
    expect(row.body).toContain(ANALYSIS.transcript);
    expect(row.body).toContain("What worked");
    expect(row.body).toContain(ANALYSIS.what_worked!);
    expect(row.body).toContain("Repeat");
    expect(row.body).toContain(ANALYSIS.what_to_repeat!);
  });
});

describe("isInVault helper integration", () => {
  it("matches by source_file prefix when listing user's vault", async () => {
    const { listResearchVault } = await import("./vault");
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const ilike = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi
      .fn()
      .mockResolvedValue({ data: [], error: null });
    const from = vi.fn().mockReturnValue({ select, eq, ilike, order, limit });
    const client = { from } as unknown as VaultClient;
    // (cast through unknown is the project convention for typed stubs)

    await listResearchVault(client, "u1", 20);

    expect(from).toHaveBeenCalledWith("client_assets");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(ilike).toHaveBeenCalledWith("source_file", "competitor:%");
    expect(limit).toHaveBeenCalledWith(20);
  });
});
