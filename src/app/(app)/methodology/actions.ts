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
const MAX_ADDITION_CHARS = 2000;

export type SaveMethodologyState = { error?: string; saved?: boolean };

/**
 * Append a new rule to the creator's methodology overlay. The UI hides the
 * existing overlay — clients only type the rule they want to add, and we
 * join it onto whatever is already stored with a newline separator. Cap on
 * the combined value keeps the prompt budget sane.
 */
export async function saveMethodologyAction(
  _prev: SaveMethodologyState,
  form: FormData,
): Promise<SaveMethodologyState> {
  const addition = (form.get("content") ?? "").toString().trim();
  if (addition.length === 0) {
    return { error: "Write a rule first." };
  }
  if (addition.length > MAX_ADDITION_CHARS) {
    return {
      error: `Rule is too long. Keep it under ${MAX_ADDITION_CHARS} characters.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  try {
    const existing = (await getUserMethodology(supabase, user.id)) ?? "";
    const combined = existing.trim().length === 0
      ? addition
      : `${existing.trim()}\n${addition}`;

    if (combined.length > MAX_OVERLAY_CHARS) {
      return {
        error: `Your methodology is full (${MAX_OVERLAY_CHARS} characters). Contact support to make room.`,
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
