/**
 * Admin client-health stats.
 *
 * Powers the /admin overview page. Uses the service-role Supabase client
 * because it reads across every user (no JWT to scope to), and reaches
 * into `auth.admin.listUsers` for the email + last_sign_in_at fields
 * that don't exist on the public `profiles` row.
 *
 * Token spend / API cost is deliberately out of scope here. We don't
 * record token usage today; this view would lie if it tried to
 * synthesize a number, so we omit it. Surface it via a separate
 * `api_usage` table once we start logging Anthropic responses with
 * `usage.input_tokens` / `usage.output_tokens`.
 */

import type { AdminSupabaseClient } from "./persistence";

export type ClientHealth = "green" | "amber" | "red";

export interface ClientHealthRow {
  id: string;
  name: string;
  email: string | null;
  scripts: number;
  chats: number;
  messages: number;
  last_sign_in_at: string | null;
  health: ClientHealth;
  is_admin: boolean;
}

export interface AdminStats {
  total_clients: number;
  total_scripts: number;
  total_chats: number;
  total_messages: number;
}

const DAY_MS = 86_400_000;

export function deriveHealth(
  lastSignInAt: string | null | undefined,
  now: Date,
): ClientHealth {
  if (!lastSignInAt) return "red";
  const ts = new Date(lastSignInAt).getTime();
  if (Number.isNaN(ts)) return "red";
  const days = (now.getTime() - ts) / DAY_MS;
  if (days <= 7) return "green";
  if (days <= 30) return "amber";
  return "red";
}

function pickName(displayName: string | null, email: string | null): string {
  const dn = (displayName ?? "").trim();
  if (dn.length > 0) return dn;
  if (email && email.trim().length > 0) return email;
  return "Unknown";
}

function tallyByUser<T extends { user_id: string }>(
  rows: T[] | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    out.set(r.user_id, (out.get(r.user_id) ?? 0) + 1);
  }
  return out;
}

const HEALTH_RANK: Record<ClientHealth, number> = { red: 0, amber: 1, green: 2 };

export async function computeClientHealth(
  supabase: AdminSupabaseClient,
  opts: { now?: Date } = {},
): Promise<ClientHealthRow[]> {
  const now = opts.now ?? new Date();

  const [profilesRes, scriptsRes, conversationsRes, messagesRes, usersRes] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at"),
      supabase.from("scripts").select("user_id"),
      supabase.from("conversations").select("user_id"),
      supabase.from("messages").select("user_id, role"),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  if (profilesRes.error) throw new Error(`profiles: ${profilesRes.error.message}`);
  if (scriptsRes.error) throw new Error(`scripts: ${scriptsRes.error.message}`);
  if (conversationsRes.error) throw new Error(`conversations: ${conversationsRes.error.message}`);
  if (messagesRes.error) throw new Error(`messages: ${messagesRes.error.message}`);
  if (usersRes.error) throw new Error(`auth.listUsers: ${usersRes.error.message}`);

  const scriptsByUser = tallyByUser<{ user_id: string }>(scriptsRes.data);
  const chatsByUser = tallyByUser<{ user_id: string }>(conversationsRes.data);
  const messagesByUser = tallyByUser<{ user_id: string }>(messagesRes.data);

  const usersById = new Map<
    string,
    { email: string | null; last_sign_in_at: string | null; is_admin: boolean }
  >();
  for (const u of usersRes.data?.users ?? []) {
    const meta = (u as { app_metadata?: Record<string, unknown> | null }).app_metadata;
    usersById.set(u.id, {
      email: u.email ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      is_admin: meta?.is_admin === true,
    });
  }

  const rows: ClientHealthRow[] = (profilesRes.data ?? []).map((p) => {
    const auth = usersById.get(p.id) ?? {
      email: null,
      last_sign_in_at: null,
      is_admin: false,
    };
    return {
      id: p.id,
      name: pickName(p.display_name, auth.email),
      email: auth.email,
      scripts: scriptsByUser.get(p.id) ?? 0,
      chats: chatsByUser.get(p.id) ?? 0,
      messages: messagesByUser.get(p.id) ?? 0,
      last_sign_in_at: auth.last_sign_in_at,
      health: deriveHealth(auth.last_sign_in_at, now),
      is_admin: auth.is_admin,
    };
  });

  rows.sort((a, b) => {
    if (a.health !== b.health) return HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
    const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
    const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
    return tb - ta;
  });

  return rows;
}

export async function computeAdminStats(
  supabase: AdminSupabaseClient,
): Promise<AdminStats> {
  const head = { count: "exact" as const, head: true };
  const [c, s, ch, m] = await Promise.all([
    supabase.from("profiles").select("*", head),
    supabase.from("scripts").select("*", head),
    supabase.from("conversations").select("*", head),
    supabase.from("messages").select("*", head),
  ]);
  if (c.error) throw new Error(`profiles count: ${c.error.message}`);
  if (s.error) throw new Error(`scripts count: ${s.error.message}`);
  if (ch.error) throw new Error(`conversations count: ${ch.error.message}`);
  if (m.error) throw new Error(`messages count: ${m.error.message}`);
  return {
    total_clients: c.count ?? 0,
    total_scripts: s.count ?? 0,
    total_chats: ch.count ?? 0,
    total_messages: m.count ?? 0,
  };
}
