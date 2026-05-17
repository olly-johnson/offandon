/**
 * scripts/fathom-aliases.ts
 *
 * BO-061: CRUD for public.fathom_email_aliases.
 *
 * Usage:
 *   npm run fathom:aliases -- --list
 *   npm run fathom:aliases -- --list <user_id>
 *   npm run fathom:aliases -- --add <user_id> <fathom_email>
 *   npm run fathom:aliases -- --remove <user_id> <fathom_email>
 *
 * Aliases are normalised to lowercase by a DB trigger, so case in the
 * input doesn't matter.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

type Mode = "list" | "add" | "remove";

interface Args {
  mode: Mode;
  userId: string | null;
  email: string | null;
}

function parseArgs(argv: string[]): Args {
  const args = [...argv];
  let mode: Mode | null = null;
  let userId: string | null = null;
  let email: string | null = null;

  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--list") {
      mode = "list";
      userId = args[0] && !args[0].startsWith("--") ? args.shift()! : null;
    } else if (arg === "--add") {
      mode = "add";
      userId = args.shift() ?? null;
      email = args.shift() ?? null;
    } else if (arg === "--remove") {
      mode = "remove";
      userId = args.shift() ?? null;
      email = args.shift() ?? null;
    }
  }

  if (!mode) {
    throw new Error(
      "missing mode. use --list [user_id], --add <user_id> <email>, or --remove <user_id> <email>",
    );
  }
  if ((mode === "add" || mode === "remove") && (!userId || !email)) {
    throw new Error(`--${mode} requires <user_id> <email>`);
  }
  return { mode, userId, email };
}

async function main(): Promise<void> {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (args.mode === "list") {
    let q = supabase
      .from("fathom_email_aliases")
      .select("user_id, fathom_email, created_at")
      .order("user_id", { ascending: true });
    if (args.userId) q = q.eq("user_id", args.userId);
    const { data, error } = await q;
    if (error) throw new Error(`list failed: ${error.message}`);
    if (!data || data.length === 0) {
      console.log("no aliases");
      return;
    }
    for (const row of data) {
      console.log(`${row.user_id}  ${row.fathom_email}  (${row.created_at})`);
    }
    console.log("");
    console.log(`total: ${data.length}`);
    return;
  }

  if (args.mode === "add") {
    const { error } = await supabase
      .from("fathom_email_aliases")
      .upsert(
        { user_id: args.userId!, fathom_email: args.email! },
        { onConflict: "user_id,fathom_email" },
      );
    if (error) throw new Error(`add failed: ${error.message}`);
    console.log(`added: ${args.userId}  ${args.email!.toLowerCase()}`);
    return;
  }

  if (args.mode === "remove") {
    const { error } = await supabase
      .from("fathom_email_aliases")
      .delete()
      .eq("user_id", args.userId!)
      .eq("fathom_email", args.email!.toLowerCase());
    if (error) throw new Error(`remove failed: ${error.message}`);
    console.log(`removed: ${args.userId}  ${args.email!.toLowerCase()}`);
    return;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
