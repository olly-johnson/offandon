"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addCompetitor,
  CompetitorLimitError,
  DuplicateCompetitorError,
  InvalidCompetitorHandleError,
  removeCompetitor,
} from "@/engines/competitor";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("research.actions");

export type AddCompetitorState = { error?: string; ok?: boolean };

export async function addCompetitorAction(
  _prev: AddCompetitorState,
  form: FormData,
): Promise<AddCompetitorState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const raw = (form.get("handle") ?? "").toString();

  try {
    await addCompetitor(supabase, { userId: user.id, rawHandle: raw });
  } catch (err) {
    if (
      err instanceof InvalidCompetitorHandleError ||
      err instanceof DuplicateCompetitorError ||
      err instanceof CompetitorLimitError
    ) {
      return { error: err.message };
    }
    log.error("addCompetitorAction failed", {
      user_id: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not add competitor. Try again." };
  }

  log.info("competitor added", { user_id: user.id });
  revalidatePath("/research");
  return { ok: true };
}

export async function removeCompetitorAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  try {
    await removeCompetitor(supabase, { userId: user.id, id });
    log.info("competitor removed", { user_id: user.id, id });
  } catch (err) {
    log.error("removeCompetitorAction failed", {
      user_id: user.id,
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath("/research");
}
