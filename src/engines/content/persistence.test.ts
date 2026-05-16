import { describe, expect, it, vi } from "vitest";

import {
  type ContentSupabaseClient,
  createScriptBatch,
  deleteScriptForUser,
  saveGeneratedScripts,
  updateBatchStatus,
} from "./persistence";
import type { GeneratedScript } from "./types";
import type { VoiceDNA } from "@/engines/voice/types";

const FIXTURE_DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic"],
  },
  content_pillars: [
    { name: "Operator Frameworks", description: "x", example_topics: ["y"] },
  ],
  prohibited_phrases: ["delve"],
  audience_persona: {
    description: "Coaches",
    pain_points: ["churn"],
    aspirations: ["MRR"],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

const FIXTURE_SCRIPTS: GeneratedScript[] = [
  {
    hook: "Most coaches lose leads at the same point.",
    body: "It is the discovery call. Reverse the order.",
    pillar: "Operator Frameworks",
    angle: "pain_point",
  },
  {
    hook:
      "This hook is intentionally longer than eighty characters so we can verify the title-truncation path is exercised at insertion time.",
    body: "Body text here.",
    pillar: "Operator Frameworks",
    angle: "framework",
  },
];

describe("saveGeneratedScripts", () => {
  it("inserts one row per script with batch_id, user_id, voice_dna snapshot, source, status", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await saveGeneratedScripts(supabase, {
      batchId: "batch-1",
      userId: "user-1",
      scripts: FIXTURE_SCRIPTS,
      voiceDnaSnapshot: FIXTURE_DNA,
    });

    expect(from).toHaveBeenCalledWith("scripts");
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      batch_id: "batch-1",
      user_id: "user-1",
      hook: FIXTURE_SCRIPTS[0].hook,
      body: FIXTURE_SCRIPTS[0].body,
      source: "generated",
      status: "draft",
    });
  });

  it("auto-generates a title from the hook, truncating long ones", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await saveGeneratedScripts(supabase, {
      batchId: "batch-1",
      userId: "user-1",
      scripts: FIXTURE_SCRIPTS,
      voiceDnaSnapshot: FIXTURE_DNA,
    });

    const rows = insert.mock.calls[0][0];
    expect(rows[0].title).toBe(FIXTURE_SCRIPTS[0].hook);
    expect(rows[1].title?.endsWith("...")).toBe(true);
    expect(rows[1].title?.length).toBe(80);
  });

  it("throws on insert error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await expect(
      saveGeneratedScripts(supabase, {
        batchId: "b",
        userId: "u",
        scripts: FIXTURE_SCRIPTS,
        voiceDnaSnapshot: FIXTURE_DNA,
      }),
    ).rejects.toThrow(/denied/);
  });
});

describe("createScriptBatch", () => {
  it("inserts a pending batch and returns its id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "new-batch-id" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    const id = await createScriptBatch(supabase, {
      userId: "user-1",
      voiceDnaSnapshot: FIXTURE_DNA,
      countRequested: 7,
    });

    expect(id).toBe("new-batch-id");
    expect(from).toHaveBeenCalledWith("script_batches");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        count_requested: 7,
        status: "pending",
      }),
    );
  });
});

describe("updateBatchStatus", () => {
  it("updates the batch row by id with the supplied patch", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await updateBatchStatus(supabase, "batch-1", {
      status: "complete",
      count_generated: 7,
      completed_at: "2026-05-09T12:01:00.000Z",
    });

    expect(from).toHaveBeenCalledWith("script_batches");
    expect(update).toHaveBeenCalledWith({
      status: "complete",
      count_generated: 7,
      completed_at: "2026-05-09T12:01:00.000Z",
    });
    expect(eq).toHaveBeenCalledWith("id", "batch-1");
  });

  it("throws on update error", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { code: "x", message: "boom" } });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await expect(
      updateBatchStatus(supabase, "batch-1", { status: "failed" }),
    ).rejects.toThrow(/boom/);
  });
});

describe("deleteScriptForUser", () => {
  function buildClient(result: { count: number | null; error: { code: string; message: string } | null }) {
    const second = vi.fn().mockResolvedValue(result);
    const first = vi.fn().mockReturnValue({ eq: second });
    const del = vi.fn().mockReturnValue({ eq: first });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as ContentSupabaseClient;
    return { supabase, from, del, first, second };
  }

  it("deletes the row scoped to (id, user_id) and returns true on a single deletion", async () => {
    const { supabase, from, del, first, second } = buildClient({ count: 1, error: null });

    const ok = await deleteScriptForUser(supabase, {
      userId: "user-1",
      scriptId: "script-1",
    });

    expect(ok).toBe(true);
    expect(from).toHaveBeenCalledWith("scripts");
    expect(del).toHaveBeenCalledWith({ count: "exact" });
    expect(first).toHaveBeenCalledWith("id", "script-1");
    expect(second).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns false when no rows match (cross-user attempt or already deleted)", async () => {
    const { supabase } = buildClient({ count: 0, error: null });

    const ok = await deleteScriptForUser(supabase, {
      userId: "stranger",
      scriptId: "script-1",
    });

    expect(ok).toBe(false);
  });

  it("throws on delete error", async () => {
    const { supabase } = buildClient({
      count: null,
      error: { code: "42501", message: "denied" },
    });

    await expect(
      deleteScriptForUser(supabase, { userId: "u", scriptId: "s" }),
    ).rejects.toThrow(/denied/);
  });
});
