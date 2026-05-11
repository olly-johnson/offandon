"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { deleteMemory } from "@/engines/memory/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("memory.actions");

export type DeleteMemoryState = { error?: string };

/**
 * Drop one memory row. RLS ensures the caller can only delete their own.
 * Returns an inline error state if the row doesn't exist or the user is
 * unauthed.
 */
export async function deleteMemoryAction(
  memoryId: string,
  _prev: DeleteMemoryState,
  _form: FormData,
): Promise<DeleteMemoryState> {
  // useActionState requires (prev, form) on the bound function, but we
  // only need the memoryId here. Acknowledge the params so eslint
  // doesn't flag "after-used" unused warnings.
  void _prev;
  void _form;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  try {
    await deleteMemory(supabase, memoryId);
    log.info("memory deleted", { memory_id: memoryId, user_id: user.id });
  } catch (err) {
    log.error("memory delete failed", {
      memory_id: memoryId,
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not delete. Try again." };
  }

  revalidatePath("/memory");
  return {};
}
