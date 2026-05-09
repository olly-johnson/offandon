"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.signin");

const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SigninState = { error?: string };

export async function signin(_prev: SigninState, formData: FormData): Promise<SigninState> {
  const parsed = SigninSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    log.warn("validation failed", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    log.warn("signin failed", { email: parsed.data.email, code: error.code, status: error.status });
    return { error: "Invalid email or password." };
  }

  log.info("signin ok", { email: parsed.data.email });
  redirect("/dashboard");
}
