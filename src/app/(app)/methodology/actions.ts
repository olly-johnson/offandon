"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { upsertUserMethodology } from "@/engines/methodology/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("methodology.actions");

const MAX_OVERLAY_CHARS = 8000;

export type SaveMethodologyState = { error?: string; saved?: boolean };

/**
 * Persist the creator's methodology overlay. Single textarea, one upsert.
 * Anything over 8000 chars is rejected at the action boundary to keep the
 * prompt budget sane; the table itself is unbounded text but the prompt
 * builders will eat through cache fast on giant overlays.
 */
export async function saveMethodologyAction(
  _prev: SaveMethodologyState,
  form: FormData,
): Promise<SaveMethodologyState> {
  const content = (form.get("content") ?? "").toString();
  if (content.length > MAX_OVERLAY_CHARS) {
    return {
      error: `Overlay is too long. Keep it under ${MAX_OVERLAY_CHARS} characters.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  try {
    await upsertUserMethodology(supabase, { userId: user.id, content });
    log.info("methodology saved", {
      user_id: user.id,
      char_count: content.trim().length,
    });
  } catch (err) {
    log.error("methodology save failed", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not save. Try again." };
  }

  revalidatePath("/methodology");
  return { saved: true };
}
