"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  getUserMethodology,
  upsertUserMethodology,
} from "@/engines/methodology/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("methodology.actions");

const MAX_OVERLAY_CHARS = 8000;

export type SaveMethodologyState = { error?: string; saved?: boolean };

/**
 * Append the submitted text to the creator's methodology overlay. The UI
 * hides the existing overlay, so clients type only the new rule(s) they
 * want to add. We join the submission onto whatever is already stored with
 * a newline separator. The 8000-char cap applies to the combined value to
 * keep the prompt budget sane.
 */
export async function saveMethodologyAction(
  _prev: SaveMethodologyState,
  form: FormData,
): Promise<SaveMethodologyState> {
  const addition = (form.get("content") ?? "").toString().trim();
  if (addition.length === 0) {
    return { error: "Write a rule first." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  try {
    const existing = ((await getUserMethodology(supabase, user.id)) ?? "").trim();
    const combined = existing.length === 0
      ? addition
      : `${existing}\n${addition}`;

    if (combined.length > MAX_OVERLAY_CHARS) {
      return {
        error: `Your methodology is full (${MAX_OVERLAY_CHARS.toLocaleString()} characters). Contact support to make room.`,
      };
    }

    await upsertUserMethodology(supabase, { userId: user.id, content: combined });
    log.info("methodology rule appended", {
      user_id: user.id,
      addition_chars: addition.length,
      total_chars: combined.length,
    });
  } catch (err) {
    log.error("methodology append failed", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not save. Try again." };
  }

  revalidatePath("/methodology");
  return { saved: true };
}
